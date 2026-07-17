import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            ShoeListView()
                .tabItem { Label("รองเท้า", systemImage: "shoe.2") }
            SettingsView()
                .tabItem { Label("ตั้งค่า", systemImage: "gearshape") }
        }
    }
}
