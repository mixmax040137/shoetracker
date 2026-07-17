import SwiftUI
import SwiftData

@main
struct ShoeTrackerApp: App {
    @StateObject private var healthKitManager = HealthKitManager()
    @StateObject private var stravaAuthManager = StravaAuthManager()
    @StateObject private var syncCoordinator = SyncCoordinator()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environmentObject(healthKitManager)
                .environmentObject(stravaAuthManager)
                .environmentObject(syncCoordinator)
        }
        .modelContainer(for: [Shoe.self, RunEntry.self])
    }
}
