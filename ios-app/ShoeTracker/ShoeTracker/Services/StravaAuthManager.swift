import Foundation
import AuthenticationServices
import UIKit

enum StravaError: LocalizedError {
    case notConnected

    var errorDescription: String? {
        switch self {
        case .notConnected: return "ยังไม่ได้เชื่อมต่อกับ Strava"
        }
    }
}

private struct StravaTokenResponse: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Int
    let athlete: StravaAthlete?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresAt = "expires_at"
        case athlete
    }
}

private struct StravaAthlete: Codable {
    let firstname: String?
    let lastname: String?
}

@MainActor
final class StravaAuthManager: NSObject, ObservableObject {
    @Published var isConnected = false
    @Published var athleteName: String?
    @Published var lastError: String?

    private let accessTokenKey = "strava_access_token"
    private let refreshTokenKey = "strava_refresh_token"
    private let expiresAtKey = "strava_expires_at"
    private let athleteNameKey = "strava_athlete_name"

    private var webAuthSession: ASWebAuthenticationSession?

    override init() {
        super.init()
        isConnected = KeychainHelper.read(forKey: refreshTokenKey) != nil
        athleteName = KeychainHelper.read(forKey: athleteNameKey)
    }

    func connect() async {
        guard !AppConfig.stravaClientID.isEmpty else {
            lastError = "ยังไม่ได้ตั้งค่า Strava Client ID (ดูวิธีตั้งค่าใน README)"
            return
        }

        var components = URLComponents(string: "https://www.strava.com/oauth/mobile/authorize")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: AppConfig.stravaClientID),
            URLQueryItem(name: "redirect_uri", value: AppConfig.stravaRedirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "approval_prompt", value: "auto"),
            URLQueryItem(name: "scope", value: "read,activity:read_all,profile:read_all")
        ]

        do {
            let callbackURL = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<URL, Error>) in
                let session = ASWebAuthenticationSession(
                    url: components.url!,
                    callbackURLScheme: AppConfig.stravaRedirectScheme
                ) { url, error in
                    if let url {
                        continuation.resume(returning: url)
                    } else {
                        continuation.resume(throwing: error ?? URLError(.cancelled))
                    }
                }
                session.presentationContextProvider = self
                self.webAuthSession = session
                session.start()
            }

            guard let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                .queryItems?.first(where: { $0.name == "code" })?.value else {
                lastError = "ไม่พบรหัสยืนยันตัวตนจาก Strava"
                return
            }
            try await exchangeCodeForToken(code: code)
        } catch {
            lastError = error.localizedDescription
        }
    }

    func disconnect() {
        KeychainHelper.delete(forKey: accessTokenKey)
        KeychainHelper.delete(forKey: refreshTokenKey)
        KeychainHelper.delete(forKey: expiresAtKey)
        KeychainHelper.delete(forKey: athleteNameKey)
        isConnected = false
        athleteName = nil
    }

    func validAccessToken() async throws -> String {
        if let expiresAtString = KeychainHelper.read(forKey: expiresAtKey),
           let expiresAt = Double(expiresAtString),
           Date().timeIntervalSince1970 < expiresAt - 60,
           let token = KeychainHelper.read(forKey: accessTokenKey) {
            return token
        }
        guard let refreshToken = KeychainHelper.read(forKey: refreshTokenKey) else {
            throw StravaError.notConnected
        }
        return try await refreshAccessToken(refreshToken: refreshToken)
    }

    private func exchangeCodeForToken(code: String) async throws {
        let params = [
            "client_id": AppConfig.stravaClientID,
            "client_secret": AppConfig.stravaClientSecret,
            "code": code,
            "grant_type": "authorization_code"
        ]
        let token: StravaTokenResponse = try await postForm(params: params)
        storeToken(token)
    }

    private func refreshAccessToken(refreshToken: String) async throws -> String {
        let params = [
            "client_id": AppConfig.stravaClientID,
            "client_secret": AppConfig.stravaClientSecret,
            "refresh_token": refreshToken,
            "grant_type": "refresh_token"
        ]
        let token: StravaTokenResponse = try await postForm(params: params)
        storeToken(token)
        return token.accessToken
    }

    private func postForm<T: Decodable>(params: [String: String]) async throws -> T {
        var request = URLRequest(url: URL(string: "https://www.strava.com/oauth/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = params
            .map { "\($0.key)=\($0.value)" }
            .joined(separator: "&")
            .data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    private func storeToken(_ token: StravaTokenResponse) {
        KeychainHelper.save(token.accessToken, forKey: accessTokenKey)
        KeychainHelper.save(token.refreshToken, forKey: refreshTokenKey)
        KeychainHelper.save(String(token.expiresAt), forKey: expiresAtKey)
        if let athlete = token.athlete {
            let name = [athlete.firstname, athlete.lastname].compactMap { $0 }.joined(separator: " ")
            if !name.isEmpty {
                KeychainHelper.save(name, forKey: athleteNameKey)
                athleteName = name
            }
        }
        isConnected = true
        lastError = nil
    }
}

extension StravaAuthManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        for scene in UIApplication.shared.connectedScenes {
            if let windowScene = scene as? UIWindowScene,
               let window = windowScene.windows.first(where: { $0.isKeyWindow }) {
                return window
            }
        }
        return ASPresentationAnchor()
    }
}
