import Foundation
import SwiftData

@MainActor
final class SyncCoordinator: ObservableObject {
    @Published var isSyncing = false
    @Published var lastSyncedAt: Date?
    @Published var lastError: String?

    private let lastHealthSyncKey = "lastHealthKitSyncDate"
    private let lastStravaSyncKey = "lastStravaSyncDate"
    private let lastSyncedAtKey = "lastSyncedAt"

    init() {
        lastSyncedAt = UserDefaults.standard.object(forKey: lastSyncedAtKey) as? Date
    }

    func syncAll(context: ModelContext, healthKitManager: HealthKitManager, stravaAuthManager: StravaAuthManager) async {
        isSyncing = true
        lastError = nil
        defer { isSyncing = false }

        if healthKitManager.isAuthorized {
            await syncHealthKit(context: context, healthKitManager: healthKitManager)
        }
        if stravaAuthManager.isConnected {
            await syncStrava(context: context, stravaAuthManager: stravaAuthManager)
        }

        lastSyncedAt = Date()
        UserDefaults.standard.set(lastSyncedAt, forKey: lastSyncedAtKey)
    }

    private func syncHealthKit(context: ModelContext, healthKitManager: HealthKitManager) async {
        let since = UserDefaults.standard.object(forKey: lastHealthSyncKey) as? Date
        do {
            let workouts = try await healthKitManager.fetchRunningWorkouts(since: since)
            for (workout, distanceKm) in workouts {
                guard distanceKm > 0 else { continue }
                let externalID = workout.uuid.uuidString
                guard try existingRun(externalID: externalID, context: context) == nil else { continue }

                let run = RunEntry(
                    date: workout.startDate,
                    distanceKm: distanceKm,
                    durationSeconds: workout.duration,
                    source: .healthKit,
                    externalID: externalID
                )
                context.insert(run)
            }
            UserDefaults.standard.set(Date(), forKey: lastHealthSyncKey)
        } catch {
            lastError = "ซิงค์ Apple Health ไม่สำเร็จ: \(error.localizedDescription)"
        }
    }

    private func syncStrava(context: ModelContext, stravaAuthManager: StravaAuthManager) async {
        do {
            let token = try await stravaAuthManager.validAccessToken()

            // จับคู่/สร้างรองเท้าในแอพให้ตรงกับ Gear ที่ตั้งค่าไว้ใน Strava
            let gearList = try await StravaAPIClient.fetchShoes(accessToken: token)
            let existingShoes = try context.fetch(FetchDescriptor<Shoe>())
            var gearIDToShoe: [String: Shoe] = [:]
            for gear in gearList {
                if let match = existingShoes.first(where: { $0.name.caseInsensitiveCompare(gear.name) == .orderedSame }) {
                    gearIDToShoe[gear.id] = match
                } else {
                    let shoe = Shoe(name: gear.name)
                    context.insert(shoe)
                    gearIDToShoe[gear.id] = shoe
                }
            }

            let since = UserDefaults.standard.object(forKey: lastStravaSyncKey) as? Date
            let activities = try await StravaAPIClient.fetchRunningActivities(accessToken: token, after: since)
            for activity in activities {
                let externalID = "strava_\(activity.id)"
                guard try existingRun(externalID: externalID, context: context) == nil else { continue }

                let run = RunEntry(
                    date: activity.startDateLocal,
                    distanceKm: activity.distance / 1000,
                    durationSeconds: Double(activity.movingTime),
                    source: .strava,
                    externalID: externalID,
                    notes: activity.name,
                    shoe: activity.gearID.flatMap { gearIDToShoe[$0] }
                )
                context.insert(run)
            }
            UserDefaults.standard.set(Date(), forKey: lastStravaSyncKey)
        } catch {
            lastError = "ซิงค์ Strava ไม่สำเร็จ: \(error.localizedDescription)"
        }
    }

    private func existingRun(externalID: String, context: ModelContext) throws -> RunEntry? {
        var descriptor = FetchDescriptor<RunEntry>(predicate: #Predicate { $0.externalID == externalID })
        descriptor.fetchLimit = 1
        return try context.fetch(descriptor).first
    }
}
