import Foundation

enum AppConfig {
    static let stravaClientID: String = {
        Bundle.main.object(forInfoDictionaryKey: "STRAVA_CLIENT_ID") as? String ?? ""
    }()

    static let stravaClientSecret: String = {
        Bundle.main.object(forInfoDictionaryKey: "STRAVA_CLIENT_SECRET") as? String ?? ""
    }()

    static let stravaRedirectScheme = "shoetracker"
    static let stravaRedirectURI = "shoetracker://strava-auth"
}
