import Foundation
import HealthKit

@MainActor
final class HealthKitManager: ObservableObject {
    @Published var isAuthorized = false

    private let healthStore = HKHealthStore()
    private let workoutType = HKObjectType.workoutType()
    private let distanceType = HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning)!

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization() async {
        guard isAvailable else { return }
        do {
            try await healthStore.requestAuthorization(toShare: [], read: [workoutType, distanceType])
            isAuthorized = true
        } catch {
            isAuthorized = false
        }
    }

    /// ดึงข้อมูลการวิ่งจาก Apple Health พร้อมระยะทางรวมของแต่ละครั้ง (กิโลเมตร)
    func fetchRunningWorkouts(since: Date?) async throws -> [(workout: HKWorkout, distanceKm: Double)] {
        let runningPredicate = HKQuery.predicateForWorkouts(with: .running)
        let predicate: NSPredicate
        if let since {
            let datePredicate = HKQuery.predicateForSamples(withStart: since, end: nil, options: .strictStartDate)
            predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [runningPredicate, datePredicate])
        } else {
            predicate = runningPredicate
        }

        let workouts: [HKWorkout] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: workoutType,
                predicate: predicate,
                limit: 200,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: (samples as? [HKWorkout]) ?? [])
                }
            }
            healthStore.execute(query)
        }

        var results: [(HKWorkout, Double)] = []
        for workout in workouts {
            let distanceKm = await distance(for: workout)
            results.append((workout, distanceKm))
        }
        return results
    }

    private func distance(for workout: HKWorkout) async -> Double {
        let predicate = HKQuery.predicateForObjects(from: workout)
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: distanceType,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, statistics, _ in
                let km = statistics?.sumQuantity()?.doubleValue(for: .meterUnit(with: .kilo)) ?? 0
                continuation.resume(returning: km)
            }
            healthStore.execute(query)
        }
    }
}
