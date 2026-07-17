import SwiftUI

struct RunRowView: View {
    let run: RunEntry

    private var dateText: String {
        run.date.formatted(date: .abbreviated, time: .shortened)
    }

    private var sourceIcon: String {
        switch run.source {
        case .manual: return "hand.point.up.left"
        case .healthKit: return "heart.fill"
        case .strava: return "figure.run"
        }
    }

    var body: some View {
        HStack {
            Image(systemName: sourceIcon)
                .foregroundStyle(.secondary)
                .frame(width: 20)
            VStack(alignment: .leading, spacing: 2) {
                Text(dateText)
                if let notes = run.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(String(format: "%.1f กม.", run.distanceKm))
        }
    }
}
