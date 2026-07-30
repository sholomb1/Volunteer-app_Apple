// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
// (Manually maintained to pin capacitor-swift-pm to 7.6.8 so the plugin
//  versions in node_modules — geolocation@7.1.8, status-bar@7.0.6,
//  push-notifications@7.0.7 — compile against a matching runtime.
//  Also converted the local package paths from Windows backslashes to
//  POSIX forward-slashes so the macOS runner can find them.)
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "7.6.8"),
        .package(name: "CapacitorGeolocation",       path: "../../../node_modules/@capacitor/geolocation"),
        .package(name: "CapacitorPushNotifications", path: "../../../node_modules/@capacitor/push-notifications"),
        .package(name: "CapacitorStatusBar",         path: "../../../node_modules/@capacitor/status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova",   package: "capacitor-swift-pm"),
                .product(name: "CapacitorGeolocation",       package: "CapacitorGeolocation"),
                .product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"),
                .product(name: "CapacitorStatusBar",         package: "CapacitorStatusBar")
            ]
        )
    ]
)
