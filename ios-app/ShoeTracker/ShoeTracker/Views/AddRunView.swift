import SwiftUI
import SwiftData

struct AddRunView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @Query(filter: #Predicate<Shoe> { !$0.isRetired }, sort: \Shoe.name) private var activeShoes: [Shoe]

    let preselectedShoe: Shoe?

    @State private var selectedShoe: Shoe?
    @State private var date = Date()
    @State private var distanceKm: Double = 0
    @State private var durationMinutes: Double = 0
    @State private var notes = ""

    var body: some View {
        NavigationStack {
            Form {
                if preselectedShoe == nil {
                    Section("รองเท้า") {
                        Picker("เลือกรองเท้า", selection: $selectedShoe) {
                            Text("เลือกรองเท้า").tag(Shoe?.none)
                            ForEach(activeShoes) { shoe in
                                Text(shoe.name).tag(Shoe?.some(shoe))
                            }
                        }
                    }
                }
                Section("รายละเอียดการวิ่ง") {
                    DatePicker("วันและเวลา", selection: $date)
                    HStack {
                        Text("ระยะทาง")
                        Spacer()
                        TextField("0.0", value: $distanceKm, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                        Text("กม.")
                    }
                    HStack {
                        Text("เวลาที่ใช้")
                        Spacer()
                        TextField("0", value: $durationMinutes, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                        Text("นาที")
                    }
                    TextField("บันทึกเพิ่มเติม (ถ้ามี)", text: $notes)
                }
            }
            .navigationTitle("บันทึกการวิ่ง")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("ยกเลิก") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("บันทึก") { save() }
                        .disabled(distanceKm <= 0 || (preselectedShoe == nil && selectedShoe == nil))
                }
            }
            .onAppear {
                selectedShoe = preselectedShoe
            }
        }
    }

    private func save() {
        guard let shoe = preselectedShoe ?? selectedShoe else { return }
        let run = RunEntry(
            date: date,
            distanceKm: distanceKm,
            durationSeconds: durationMinutes > 0 ? durationMinutes * 60 : nil,
            source: .manual,
            notes: notes.isEmpty ? nil : notes,
            shoe: shoe
        )
        context.insert(run)
        dismiss()
    }
}
