import SwiftUI
import SwiftData

struct SettingsView: View {
    @EnvironmentObject private var healthKitManager: HealthKitManager
    @EnvironmentObject private var stravaAuthManager: StravaAuthManager
    @EnvironmentObject private var syncCoordinator: SyncCoordinator
    @Environment(\.modelContext) private var context

    var body: some View {
        NavigationStack {
            Form {
                Section("Apple Health") {
                    HStack {
                        Text("สถานะ")
                        Spacer()
                        Text(healthKitManager.isAuthorized ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เชื่อมต่อ")
                            .foregroundStyle(.secondary)
                    }
                    if !healthKitManager.isAuthorized {
                        Button("เชื่อมต่อ Apple Health") {
                            Task { await healthKitManager.requestAuthorization() }
                        }
                    }
                }

                Section("Strava") {
                    HStack {
                        Text("สถานะ")
                        Spacer()
                        Text(stravaAuthManager.isConnected ? (stravaAuthManager.athleteName ?? "เชื่อมต่อแล้ว") : "ยังไม่ได้เชื่อมต่อ")
                            .foregroundStyle(.secondary)
                    }
                    if stravaAuthManager.isConnected {
                        Button("ยกเลิกการเชื่อมต่อ", role: .destructive) {
                            stravaAuthManager.disconnect()
                        }
                    } else {
                        Button("เชื่อมต่อ Strava") {
                            Task { await stravaAuthManager.connect() }
                        }
                    }
                    if let error = stravaAuthManager.lastError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                Section("ซิงค์ข้อมูล") {
                    if let lastSynced = syncCoordinator.lastSyncedAt {
                        HStack {
                            Text("ซิงค์ล่าสุด")
                            Spacer()
                            Text(lastSynced.formatted(date: .abbreviated, time: .shortened))
                                .foregroundStyle(.secondary)
                        }
                    }
                    Button {
                        Task {
                            await syncCoordinator.syncAll(
                                context: context,
                                healthKitManager: healthKitManager,
                                stravaAuthManager: stravaAuthManager
                            )
                        }
                    } label: {
                        if syncCoordinator.isSyncing {
                            ProgressView()
                        } else {
                            Text("ซิงค์เดี๋ยวนี้")
                        }
                    }
                    .disabled(syncCoordinator.isSyncing)
                    if let error = syncCoordinator.lastError {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("ตั้งค่า")
        }
    }
}
