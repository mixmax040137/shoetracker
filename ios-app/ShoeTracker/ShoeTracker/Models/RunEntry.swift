import Foundation
import SwiftData

enum RunSource: String, Codable {
    case manual
    case healthKit
    case strava
}

@Model
final class RunEntry {
    var id: UUID
    var date: Date
    var distanceKm: Double
    var durationSeconds: Double?
    var sourceRaw: String
    /// ตัวระบุจาก HealthKit/Strava ใช้กันไม่ให้ซิงค์ข้อมูลซ้ำ
    var externalID: String?
    var notes: String?
    var createdAt: Date

    var shoe: Shoe?

    var source: RunSource {
        get { RunSource(rawValue: sourceRaw) ?? .manual }
        set { sourceRaw = newValue.rawValue }
    }

    init(
        date: Date,
        distanceKm: Double,
        durationSeconds: Double? = nil,
        source: RunSource = .manual,
        externalID: String? = nil,
        notes: String? = nil,
        shoe: Shoe? = nil
    ) {
        self.id = UUID()
        self.date = date
        self.distanceKm = distanceKm
        self.durationSeconds = durationSeconds
        self.sourceRaw = source.rawValue
        self.externalID = externalID
        self.notes = notes
        self.createdAt = Date()
        self.shoe = shoe
    }
}
