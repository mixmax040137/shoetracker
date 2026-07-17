import SwiftUI
import SwiftData

struct UnassignedRunsView: View {
    let runs: [RunEntry]

    @Query(filter: #Predicate<Shoe> { !$0.isRetired }, sort: \Shoe.name) private var activeShoes: [Shoe]

    var body: some View {
        List(runs.sorted { $0.date > $1.date }) { run in
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(run.date.formatted(date: .abbreviated, time: .shortened))
                    Text(String(format: "%.1f กม.", run.distanceKm))
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Menu {
                    if activeShoes.isEmpty {
                        Text("ยังไม่มีรองเท้าให้เลือก")
                    }
                    ForEach(activeShoes) { shoe in
                        Button(shoe.name) {
                            run.shoe = shoe
                        }
                    }
                } label: {
                    Label("กำหนดรองเท้า", systemImage: "shoe.2")
                }
            }
        }
        .navigationTitle("ยังไม่ระบุรองเท้า")
    }
}
