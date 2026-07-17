import SwiftUI
import SwiftData

struct AddEditShoeView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    let shoe: Shoe?

    @State private var name = ""
    @State private var brand = ""
    @State private var category: ShoeCategory = .road
    @State private var startingDistanceKm: Double = 0
    @State private var isRetired = false

    var body: some View {
        NavigationStack {
            Form {
                Section("ข้อมูลรองเท้า") {
                    TextField("ชื่อรองเท้า เช่น ASICS Metaspeed Edge", text: $name)
                    TextField("ยี่ห้อ (ถ้ามี)", text: $brand)
                    Picker("ประเภท", selection: $category) {
                        ForEach(ShoeCategory.allCases) { category in
                            Text(category.rawValue).tag(category)
                        }
                    }
                }
                Section("ระยะทางเริ่มต้น") {
                    HStack {
                        Text("ระยะที่วิ่งมาแล้วก่อนเริ่มบันทึก")
                        Spacer()
                        TextField("0", value: $startingDistanceKm, format: .number)
                            .keyboardType(.decimalPad)
                            .multilineTextAlignment(.trailing)
                            .frame(width: 80)
                        Text("กม.")
                    }
                }
                if shoe != nil {
                    Section {
                        Toggle("เลิกใช้งานแล้ว", isOn: $isRetired)
                    }
                }
            }
            .navigationTitle(shoe == nil ? "เพิ่มรองเท้า" : "แก้ไขรองเท้า")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("ยกเลิก") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("บันทึก") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear(perform: loadExisting)
        }
    }

    private func loadExisting() {
        guard let shoe else { return }
        name = shoe.name
        brand = shoe.brand
        category = shoe.category
        startingDistanceKm = shoe.startingDistanceKm
        isRetired = shoe.isRetired
    }

    private func save() {
        if let shoe {
            shoe.name = name
            shoe.brand = brand
            shoe.category = category
            shoe.startingDistanceKm = startingDistanceKm
            shoe.isRetired = isRetired
        } else {
            let newShoe = Shoe(name: name, brand: brand, category: category, startingDistanceKm: startingDistanceKm)
            context.insert(newShoe)
        }
        dismiss()
    }
}
