import Foundation
import SwiftData

enum ShoeCategory: String, Codable, CaseIterable, Identifiable {
    case road = "ถนน"
    case trail = "เทรล"
    case race = "แข่งขัน"
    case other = "อื่นๆ"

    var id: String { rawValue }
}

@Model
final class Shoe {
    var id: UUID
    var name: String
    var brand: String
    var categoryRaw: String
    /// ระยะทางที่วิ่งมาแล้วก่อนเริ่มบันทึกในแอพ (เช่น ย้ายข้อมูลมาจาก Strava)
    var startingDistanceKm: Double
    var isRetired: Bool
    var dateAdded: Date

    @Relationship(deleteRule: .cascade, inverse: \RunEntry.shoe)
    var runs: [RunEntry] = []

    var category: ShoeCategory {
        get { ShoeCategory(rawValue: categoryRaw) ?? .other }
        set { categoryRaw = newValue.rawValue }
    }

    var totalDistanceKm: Double {
        startingDistanceKm + runs.reduce(0) { $0 + $1.distanceKm }
    }

    init(
        name: String,
        brand: String = "",
        category: ShoeCategory = .road,
        startingDistanceKm: Double = 0,
        isRetired: Bool = false
    ) {
        self.id = UUID()
        self.name = name
        self.brand = brand
        self.categoryRaw = category.rawValue
        self.startingDistanceKm = startingDistanceKm
        self.isRetired = isRetired
        self.dateAdded = Date()
    }
}
