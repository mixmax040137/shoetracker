import SwiftUI
import SwiftData

struct ShoeListView: View {
    @Environment(\.modelContext) private var context
    @EnvironmentObject private var healthKitManager: HealthKitManager
    @EnvironmentObject private var stravaAuthManager: StravaAuthManager
    @EnvironmentObject private var syncCoordinator: SyncCoordinator

    @Query(sort: \Shoe.dateAdded, order: .reverse) private var shoes: [Shoe]
    @Query(filter: #Predicate<RunEntry> { $0.shoe == nil }) private var unassignedRuns: [RunEntry]

    @State private var showingAddShoe = false

    private var activeShoes: [Shoe] {
        shoes.filter { !$0.isRetired }.sorted { $0.totalDistanceKm > $1.totalDistanceKm }
    }
    private var retiredShoes: [Shoe] {
        shoes.filter(\.isRetired)
    }

    var body: some View {
        NavigationStack {
            List {
                if !unassignedRuns.isEmpty {
                    Section {
                        NavigationLink {
                            UnassignedRunsView(runs: unassignedRuns)
                        } label: {
                            Label("การวิ่งที่ยังไม่ระบุรองเท้า (\(unassignedRuns.count))", systemImage: "questionmark.circle")
                        }
                    }
                }

                Section("รองเท้าที่ใช้งาน") {
                    if activeShoes.isEmpty {
                        Text("แตะ + เพื่อเพิ่มรองเท้าคู่แรกของคุณ")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(activeShoes) { shoe in
                        NavigationLink {
                            ShoeDetailView(shoe: shoe)
                        } label: {
                            ShoeRowView(shoe: shoe)
                        }
                    }
                    .onDelete { offsets in
                        delete(shoes: offsets.map { activeShoes[$0] })
                    }
                }

                if !retiredShoes.isEmpty {
                    Section("รองเท้าที่เลิกใช้") {
                        ForEach(retiredShoes) { shoe in
                            NavigationLink {
                                ShoeDetailView(shoe: shoe)
                            } label: {
                                ShoeRowView(shoe: shoe)
                            }
                        }
                        .onDelete { offsets in
                            delete(shoes: offsets.map { retiredShoes[$0] })
                        }
                    }
                }
            }
            .navigationTitle("รองเท้าของคุณ")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
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
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(syncCoordinator.isSyncing)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingAddShoe = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingAddShoe) {
                AddEditShoeView(shoe: nil)
            }
        }
    }

    private func delete(shoes: [Shoe]) {
        for shoe in shoes {
            context.delete(shoe)
        }
    }
}
