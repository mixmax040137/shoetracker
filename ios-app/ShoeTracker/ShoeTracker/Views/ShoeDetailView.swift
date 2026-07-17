import SwiftUI
import SwiftData

struct ShoeDetailView: View {
    @Bindable var shoe: Shoe
    @Environment(\.modelContext) private var context

    @State private var showingAddRun = false
    @State private var showingEditShoe = false

    private var sortedRuns: [RunEntry] {
        shoe.runs.sorted { $0.date > $1.date }
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(String(format: "%.1f กิโลเมตร", shoe.totalDistanceKm))
                        .font(.largeTitle.bold())
                    if !shoe.brand.isEmpty {
                        Text(shoe.brand)
                            .foregroundStyle(.secondary)
                    }
                    Text(shoe.category.rawValue)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
            }

            Section("ประวัติการวิ่ง") {
                if sortedRuns.isEmpty {
                    Text("ยังไม่มีการวิ่งบันทึกไว้")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sortedRuns) { run in
                        RunRowView(run: run)
                    }
                    .onDelete { offsets in
                        for index in offsets {
                            context.delete(sortedRuns[index])
                        }
                    }
                }
            }
        }
        .navigationTitle(shoe.name)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Menu {
                    Button {
                        showingAddRun = true
                    } label: {
                        Label("บันทึกการวิ่ง", systemImage: "plus")
                    }
                    Button {
                        showingEditShoe = true
                    } label: {
                        Label("แก้ไขรองเท้า", systemImage: "pencil")
                    }
                    Button {
                        shoe.isRetired.toggle()
                    } label: {
                        Label(
                            shoe.isRetired ? "ยกเลิกการเลิกใช้งาน" : "ทำเครื่องหมายเลิกใช้งาน",
                            systemImage: "archivebox"
                        )
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showingAddRun) {
            AddRunView(preselectedShoe: shoe)
        }
        .sheet(isPresented: $showingEditShoe) {
            AddEditShoeView(shoe: shoe)
        }
    }
}
