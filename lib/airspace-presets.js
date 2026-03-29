const EARTH_RADIUS_M = 6_371_000
const SECTOR_PADDING_M = 15_000

export const AIRSPACE_SETTINGS_STORAGE_KEY = "michigan-thumb-traffic-settings"

export const AIRSPACE_PRESETS = [
  {
    id: "detroit-approach",
    name: "Detroit Approach",
    displayName: "Detroit Approach 134.3",
    liveAtcCode: "kdtw_app",
    airports: [
      {
        code: "KDET",
        name: "Coleman A. Young Municipal",
        lat: 42.4124,
        lon: -83.0106
      },
      {
        code: "KDTW",
        name: "Detroit Metropolitan Wayne County",
        lat: 42.2124,
        lon: -83.3534
      },
      {
        code: "KFNT",
        name: "Bishop International",
        lat: 42.9655,
        lon: -83.7447
      }
    ]
  },
  {
    id: "salt-lake-city-approach",
    name: "Salt Lake City Approach",
    displayName: "Salt Lake City Approach 125.8",
    liveAtcCode: "kslc1_app1",
    airports: [
      {
        code: "KSLC",
        name: "Salt Lake City International",
        lat: 40.7884,
        lon: -111.9778
      },
      {
        code: "KOGD",
        name: "Ogden-Hinckley",
        lat: 41.1959,
        lon: -112.012
      },
      {
        code: "KPVU",
        name: "Provo Municipal",
        lat: 40.2192,
        lon: -111.7233
      }
    ]
  },
  {
    id: "miami-approach",
    name: "Miami Approach",
    displayName: "Miami Approach 126.9",
    liveAtcCode: "kmia3_app_133775",
    airports: [
      {
        code: "KMIA",
        name: "Miami International",
        lat: 25.7954,
        lon: -80.2901
      },
      {
        code: "KTMB",
        name: "Miami Executive",
        lat: 25.6479,
        lon: -80.4328
      },
      {
        code: "KOPF",
        name: "Miami-Opa Locka Executive",
        lat: 25.907,
        lon: -80.2784
      }
    ]
  }
]

export const DEFAULT_AIRSPACE_ID = AIRSPACE_PRESETS[0].id

function metersToLatDegrees(meters) {
  return meters / 111_320
}

function metersToLonDegrees(meters, latitudeDegrees) {
  return meters / (111_320 * Math.cos((latitudeDegrees * Math.PI) / 180))
}

function cloneAirport(airport) {
  return {
    ...airport
  }
}

export function cloneAirspaceAirports(airports) {
  return airports.map((airport) => cloneAirport(airport))
}

export function getAirspacePresetById(id) {
  return AIRSPACE_PRESETS.find((preset) => preset.id === id) || AIRSPACE_PRESETS[0]
}

export function getDefaultAirspacePreset() {
  return getAirspacePresetById(DEFAULT_AIRSPACE_ID)
}

export function getAirspacePresetLabel(preset) {
  return preset.displayName
}

export function getAirspaceLiveAtcStreamUrl(airspace) {
  const preset =
    typeof airspace === "string" ? getAirspacePresetById(airspace) : airspace || getDefaultAirspacePreset()
  return `https://d.liveatc.net/${preset.liveAtcCode}`
}

export function computeAirspaceRegion(airspace) {
  const preset =
    Array.isArray(airspace) || !airspace?.airports
      ? {
          name: "Airspace",
          airports: Array.isArray(airspace) ? airspace : []
        }
      : airspace
  const airports = preset.airports

  const averageLat = airports.reduce((sum, airport) => sum + airport.lat, 0) / airports.length
  const averageLon = airports.reduce((sum, airport) => sum + airport.lon, 0) / airports.length

  const localPoints = airports.map((airport) => {
    const eastMeters =
      ((airport.lon - averageLon) * Math.PI * EARTH_RADIUS_M * Math.cos((averageLat * Math.PI) / 180)) /
      180
    const northMeters = ((airport.lat - averageLat) * Math.PI * EARTH_RADIUS_M) / 180
    return [eastMeters, northMeters]
  })

  const minEast = Math.min(...localPoints.map((point) => point[0]))
  const maxEast = Math.max(...localPoints.map((point) => point[0]))
  const minNorth = Math.min(...localPoints.map((point) => point[1]))
  const maxNorth = Math.max(...localPoints.map((point) => point[1]))

  const sideM = Math.max(maxEast - minEast, maxNorth - minNorth) + 2 * SECTOR_PADDING_M
  const centerEast = (minEast + maxEast) * 0.5
  const centerNorth = (minNorth + maxNorth) * 0.5
  const centerLat = averageLat + metersToLatDegrees(centerNorth)
  const centerLon = averageLon + metersToLonDegrees(centerEast, averageLat)
  const halfSideM = sideM * 0.5

  return {
    name: preset.name,
    center_lat: centerLat,
    center_lon: centerLon,
    side_m: sideM,
    bbox: {
      lamin: centerLat - metersToLatDegrees(halfSideM),
      lamax: centerLat + metersToLatDegrees(halfSideM),
      lomin: centerLon - metersToLonDegrees(halfSideM, averageLat),
      lomax: centerLon + metersToLonDegrees(halfSideM, averageLat)
    }
  }
}
