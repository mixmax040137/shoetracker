import Foundation

struct StravaActivity: Codable {
    let id: Int
    let name: String
    let distance: Double
    let movingTime: Int
    let startDateLocal: Date
    let type: String
    let sportType: String?
    let gearID: String?

    enum CodingKeys: String, CodingKey {
        case id, name, distance, type
        case movingTime = "moving_time"
        case startDateLocal = "start_date_local"
        case sportType = "sport_type"
        case gearID = "gear_id"
    }
}

struct StravaGear: Codable {
    let id: String
    let name: String
    let distance: Double
}

private struct StravaAthleteDetail: Codable {
    let shoes: [StravaGear]?
}

enum StravaAPIClient {
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        let isoFormatter = ISO8601DateFormatter()
        decoder.dateDecodingStrategy = .custom { fieldDecoder in
            let container = try fieldDecoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = isoFormatter.date(from: string) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "รูปแบบวันที่ไม่ถูกต้อง: \(string)")
        }
        return decoder
    }()

    /// รองเท้าทั้งหมดที่ผู้ใช้ตั้งค่าไว้ใน Strava (Your Gear)
    static func fetchShoes(accessToken: String) async throws -> [StravaGear] {
        var request = URLRequest(url: URL(string: "https://www.strava.com/api/v3/athlete")!)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        let detail = try decoder.decode(StravaAthleteDetail.self, from: data)
        return detail.shoes ?? []
    }

    /// กิจกรรมประเภทวิ่งล่าสุด (สูงสุด 100 รายการต่อการซิงค์หนึ่งครั้ง)
    static func fetchRunningActivities(accessToken: String, after: Date?) async throws -> [StravaActivity] {
        var components = URLComponents(string: "https://www.strava.com/api/v3/athlete/activities")!
        var queryItems = [URLQueryItem(name: "per_page", value: "100")]
        if let after {
            queryItems.append(URLQueryItem(name: "after", value: String(Int(after.timeIntervalSince1970))))
        }
        components.queryItems = queryItems

        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response)
        let activities = try decoder.decode([StravaActivity].self, from: data)
        return activities.filter { $0.type == "Run" || $0.sportType == "Run" || $0.sportType == "TrailRun" }
    }

    private static func validate(_ response: URLResponse) throws {
        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw URLError(.badServerResponse)
        }
    }
}
