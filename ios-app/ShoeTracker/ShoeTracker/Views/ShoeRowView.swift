import SwiftUI

struct ShoeRowView: View {
    let shoe: Shoe

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(shoe.name)
                    .font(.body)
                if !shoe.brand.isEmpty {
                    Text(shoe.brand)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(String(format: "%.0f กม.", shoe.totalDistanceKm))
                .foregroundStyle(.secondary)
        }
    }
}
