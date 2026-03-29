import { NextResponse } from "next/server"

import { buildFeedPayload } from "../../../lib/flight-data"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const JSON_HEADERS = {
  "Cache-Control": "no-store"
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const airspaceId = searchParams.get("airspace")
    const payload = await buildFeedPayload(airspaceId || undefined)
    return NextResponse.json(payload, {
      headers: JSON_HEADERS
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load flights"
      },
      {
        status: 502,
        headers: JSON_HEADERS
      }
    )
  }
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...JSON_HEADERS
    }
  })
}
