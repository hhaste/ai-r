"use client"

import { useEffect, useRef, useState } from "react"

import { ADVISORIES_UPDATED_EVENT } from "../lib/advisory-events"
import {
  AIRSPACE_PRESETS,
  AIRSPACE_SETTINGS_STORAGE_KEY,
  DEFAULT_AIRSPACE_ID,
  getAirspaceLiveAtcStreamUrl,
  getAirspacePresetById,
  getAirspacePresetLabel
} from "../lib/airspace-presets"
import { mountFlightViewer } from "../lib/flight-viewer-runtime"

const ADVISORY_TTS_ENDPOINT = "/api/advisory-tts"
const DEFAULT_ATC_AUDIO_VOLUME = 1
const DUCKED_ATC_AUDIO_VOLUME = 0.2
const NATO_PHONETIC_WORDS = {
  A: "Alfa",
  B: "Bravo",
  C: "Charlie",
  D: "Delta",
  E: "Echo",
  F: "Foxtrot",
  G: "Golf",
  H: "Hotel",
  I: "India",
  J: "Juliett",
  K: "Kilo",
  L: "Lima",
  M: "Mike",
  N: "November",
  O: "Oscar",
  P: "Papa",
  Q: "Quebec",
  R: "Romeo",
  S: "Sierra",
  T: "Tango",
  U: "Uniform",
  V: "Victor",
  W: "Whiskey",
  X: "X-ray",
  Y: "Yankee",
  Z: "Zulu",
  0: "Zero",
  1: "One",
  2: "Two",
  3: "Tree",
  4: "Fower",
  5: "Fife",
  6: "Six",
  7: "Seven",
  8: "Ait",
  9: "Niner"
}

function toPhoneticCallsign(callsign) {
  const compactCallsign = String(callsign || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")

  if (!compactCallsign) {
    return ""
  }

  return compactCallsign
    .split("")
    .map((character) => NATO_PHONETIC_WORDS[character] || character)
    .join(" ")
}

function formatCriticalAdvisorySpeechTitle(advisory) {
  const title = String(advisory?.title || "").trim()
  if (!title) {
    return ""
  }

  const normalizedLabel = String(advisory?.label || "").trim().toLowerCase()
  if (normalizedLabel === "conflict") {
    const match = title.match(/^(.*?)\s+and\s+(.*?)\s+are converging$/i)
    if (match) {
      const leftCallsign = toPhoneticCallsign(match[1])
      const rightCallsign = toPhoneticCallsign(match[2])

      if (leftCallsign && rightCallsign) {
        return `${leftCallsign} and ${rightCallsign} are converging.`
      }
    }
  }

  if (normalizedLabel === "priority") {
    const match = title.match(/^(.*?)\s+squawking\s+(\d{4})$/i)
    if (match) {
      const callsign = toPhoneticCallsign(match[1])
      if (callsign) {
        return `${callsign} squawking ${match[2]}.`
      }
    }
  }

  return title.endsWith(".") ? title : `${title}.`
}

function formatAdvisorySpeechText(value) {
  return String(value || "")
    .replace(/\b(7500|7600|7700)\b/g, (code) => code.split("").join(" "))
    .replace(/\bK([A-Z]{3})\b/g, (_, letters) => `K ${letters.split("").join(" ")}`)
    .replace(/\s+/g, " ")
    .trim()
}

function buildAdvisorySpeechText(advisory) {
  const segments = []
  const shouldUseCriticalPhraseology =
    String(advisory?.severity || "").trim().toLowerCase() === "critical"

  if (advisory?.label) {
    segments.push(`${advisory.label} advisory.`)
  }
  if (advisory?.title) {
    segments.push(
      shouldUseCriticalPhraseology
        ? formatCriticalAdvisorySpeechTitle(advisory)
        : advisory.title.endsWith(".")
          ? advisory.title
          : `${advisory.title}.`
    )
  }
  if (advisory?.body) {
    segments.push(advisory.body)
  }

  return formatAdvisorySpeechText(segments.join(" ")).slice(0, 420)
}

function isSpeechEligibleAdvisory(advisory) {
  const normalizedLabel = String(advisory?.label || "").trim().toLowerCase()
  return normalizedLabel === "conflict" || normalizedLabel === "priority"
}

async function readAdvisorySpeechError(response) {
  const contentType = response.headers.get("content-type") || ""

  try {
    if (contentType.includes("application/json")) {
      const payload = await response.json()
      return String(payload?.error || "").trim()
    }

    return String(await response.text()).trim()
  } catch {
    return ""
  }
}

function loadStoredAirspaceId() {
  if (typeof window === "undefined") {
    return DEFAULT_AIRSPACE_ID
  }

  try {
    const rawValue = window.localStorage.getItem(AIRSPACE_SETTINGS_STORAGE_KEY)
    if (!rawValue) {
      return DEFAULT_AIRSPACE_ID
    }

    return getAirspacePresetById(JSON.parse(rawValue)?.selectedAirspaceId).id
  } catch {
    return DEFAULT_AIRSPACE_ID
  }
}

export default function FlightViewerClient() {
  const canvasRef = useRef(null)
  const audioRef = useRef(null)
  const refreshButtonRef = useRef(null)
  const injectConflictButtonRef = useRef(null)
  const statusBadgeRef = useRef(null)
  const flightCountRef = useRef(null)
  const lastUpdatedRef = useRef(null)
  const flightListRef = useRef(null)
  const feedNoteRef = useRef(null)
  const flightSearchFormRef = useRef(null)
  const flightSearchInputRef = useRef(null)
  const hudPanelRef = useRef(null)
  const collapseButtonRef = useRef(null)
  const airspaceSelectRef = useRef(null)
  const terrainToggleRef = useRef(null)
  const weatherToggleRef = useRef(null)
  const autoRefreshToggleRef = useRef(null)
  const autoRefreshRateInputRef = useRef(null)
  const hoverCardRef = useRef(null)
  const toastAlertRef = useRef(null)
  const activeAdvisoriesRef = useRef(new Map())
  const completedSpeechKeysRef = useRef(new Set())
  const queuedSpeechKeysRef = useRef(new Set())
  const speechQueueRef = useRef([])
  const speechAudioRef = useRef(null)
  const speechObjectUrlRef = useRef("")
  const speechRequestControllerRef = useRef(null)
  const currentSpeechItemRef = useRef(null)
  const isSpeakingRef = useRef(false)
  const isAudioMutedRef = useRef(true)
  const [selectedAirspaceId, setSelectedAirspaceId] = useState(DEFAULT_AIRSPACE_ID)
  const [isViewerReady, setIsViewerReady] = useState(false)
  const [isAudioMuted, setIsAudioMuted] = useState(true)
  const selectedAirspacePreset = getAirspacePresetById(selectedAirspaceId)
  const liveAtcStreamUrl = getAirspaceLiveAtcStreamUrl(selectedAirspacePreset)

  function restoreAtcAudioLevel() {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    audio.volume = DEFAULT_ATC_AUDIO_VOLUME
  }

  function releaseSpeechAudio() {
    const speechAudio = speechAudioRef.current
    if (speechAudio) {
      speechAudio.pause()
      speechAudio.src = ""
      speechAudio.load()
      speechAudioRef.current = null
    }

    if (speechObjectUrlRef.current) {
      URL.revokeObjectURL(speechObjectUrlRef.current)
      speechObjectUrlRef.current = ""
    }

    restoreAtcAudioLevel()
  }

  function stopAdvisorySpeech() {
    speechQueueRef.current = []

    if (speechRequestControllerRef.current) {
      speechRequestControllerRef.current.abort()
      speechRequestControllerRef.current = null
    }

    releaseSpeechAudio()
    isSpeakingRef.current = false
    currentSpeechItemRef.current = null
    queuedSpeechKeysRef.current = new Set()
  }

  function interruptCurrentAdvisorySpeech() {
    if (!currentSpeechItemRef.current) {
      return
    }

    if (speechRequestControllerRef.current) {
      speechRequestControllerRef.current.abort()
    }

    if (speechAudioRef.current) {
      speechAudioRef.current.pause()
    }
  }

  async function playSpeechAudio(url) {
    return new Promise((resolve, reject) => {
      const speechAudio = new Audio(url)
      let settled = false

      const cleanup = () => {
        speechAudio.removeEventListener("ended", handleEnded)
        speechAudio.removeEventListener("error", handleError)
        speechAudio.removeEventListener("pause", handlePause)
      }

      const finish = (didComplete) => {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        resolve(didComplete)
      }

      const fail = (error) => {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        reject(error)
      }

      const handleEnded = () => {
        finish(true)
      }

      const handleError = () => {
        fail(new Error("Unable to play advisory speech audio."))
      }

      const handlePause = () => {
        const duration = Number.isFinite(speechAudio.duration) ? speechAudio.duration : 0
        if (!duration || speechAudio.currentTime < duration) {
          finish(false)
        }
      }

      speechAudioRef.current = speechAudio
      speechAudio.preload = "auto"
      speechAudio.addEventListener("ended", handleEnded)
      speechAudio.addEventListener("error", handleError)
      speechAudio.addEventListener("pause", handlePause)

      const atcAudio = audioRef.current
      if (atcAudio && !atcAudio.muted) {
        atcAudio.volume = DUCKED_ATC_AUDIO_VOLUME
      }

      speechAudio.play().catch(fail)
    })
  }

  async function playNextAdvisorySpeech() {
    if (
      isAudioMutedRef.current ||
      isSpeakingRef.current ||
      !speechQueueRef.current.length
    ) {
      return
    }

    const nextSpeechItem = speechQueueRef.current.shift()
    if (!nextSpeechItem?.key || !nextSpeechItem.text) {
      return
    }

    currentSpeechItemRef.current = nextSpeechItem
    isSpeakingRef.current = true

    let didComplete = false

    try {
      const requestController = new AbortController()
      speechRequestControllerRef.current = requestController

      const response = await fetch(ADVISORY_TTS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: nextSpeechItem.text
        }),
        signal: requestController.signal
      })

      speechRequestControllerRef.current = null

      if (!response.ok) {
        const errorMessage = await readAdvisorySpeechError(response)
        throw new Error(
          errorMessage || `Advisory speech request failed with status ${response.status}.`
        )
      }

      if (isAudioMutedRef.current) {
        return
      }

      const audioBlob = await response.blob()
      const objectUrl = URL.createObjectURL(audioBlob)
      speechObjectUrlRef.current = objectUrl
      didComplete = await playSpeechAudio(objectUrl)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Unable to play advisory speech", error)
      }
    } finally {
      queuedSpeechKeysRef.current.delete(nextSpeechItem.key)

      if (didComplete && activeAdvisoriesRef.current.has(nextSpeechItem.key)) {
        completedSpeechKeysRef.current.add(nextSpeechItem.key)
      }

      currentSpeechItemRef.current = null
      isSpeakingRef.current = false
      speechRequestControllerRef.current = null
      releaseSpeechAudio()

      if (!isAudioMutedRef.current && speechQueueRef.current.length) {
        void playNextAdvisorySpeech()
      }
    }
  }

  function queuePendingAdvisories() {
    let queuedNewSpeech = false

    activeAdvisoriesRef.current.forEach((advisory, key) => {
      if (
        completedSpeechKeysRef.current.has(key) ||
        queuedSpeechKeysRef.current.has(key)
      ) {
        return
      }

      const text = buildAdvisorySpeechText(advisory)
      if (!text) {
        completedSpeechKeysRef.current.add(key)
        return
      }

      speechQueueRef.current.push({
        key,
        text
      })
      queuedSpeechKeysRef.current.add(key)
      queuedNewSpeech = true
    })

    if (queuedNewSpeech) {
      void playNextAdvisorySpeech()
    }
  }

  useEffect(() => {
    isAudioMutedRef.current = isAudioMuted

    if (isAudioMuted) {
      stopAdvisorySpeech()
      return
    }

    queuePendingAdvisories()
  }, [isAudioMuted])

  useEffect(() => {
    function handleAdvisoriesUpdated(event) {
      const nextAdvisories = Array.isArray(event.detail?.advisories)
        ? event.detail.advisories
        : []
      const nextActiveAdvisories = new Map()

      nextAdvisories.forEach((advisory) => {
        const key = String(advisory?.key || "").trim()
        if (!key || !isSpeechEligibleAdvisory(advisory)) {
          return
        }

        nextActiveAdvisories.set(key, advisory)
      })

      completedSpeechKeysRef.current.forEach((key) => {
        if (!nextActiveAdvisories.has(key)) {
          completedSpeechKeysRef.current.delete(key)
        }
      })

      queuedSpeechKeysRef.current.forEach((key) => {
        if (!nextActiveAdvisories.has(key)) {
          queuedSpeechKeysRef.current.delete(key)
        }
      })

      speechQueueRef.current = speechQueueRef.current.filter((item) =>
        nextActiveAdvisories.has(item.key)
      )

      activeAdvisoriesRef.current = nextActiveAdvisories

      const currentSpeechItem = currentSpeechItemRef.current
      if (currentSpeechItem && !nextActiveAdvisories.has(currentSpeechItem.key)) {
        interruptCurrentAdvisorySpeech()
      }

      if (!isAudioMutedRef.current) {
        queuePendingAdvisories()
      }
    }

    window.addEventListener(ADVISORIES_UPDATED_EVENT, handleAdvisoriesUpdated)

    return () => {
      window.removeEventListener(ADVISORIES_UPDATED_EVENT, handleAdvisoriesUpdated)
      stopAdvisorySpeech()
      activeAdvisoriesRef.current = new Map()
      completedSpeechKeysRef.current = new Set()
      queuedSpeechKeysRef.current = new Set()
    }
  }, [])

  useEffect(() => {
    setSelectedAirspaceId(loadStoredAirspaceId())
    setIsViewerReady(true)
  }, [])

  useEffect(() => {
    if (!isViewerReady) {
      return
    }

    const cleanup = mountFlightViewer({
      canvas: canvasRef.current,
      refreshButton: refreshButtonRef.current,
      injectConflictButton: injectConflictButtonRef.current,
      statusBadge: statusBadgeRef.current,
      flightCount: flightCountRef.current,
      lastUpdated: lastUpdatedRef.current,
      flightList: flightListRef.current,
      feedNote: feedNoteRef.current,
      flightSearchForm: flightSearchFormRef.current,
      flightSearchInput: flightSearchInputRef.current,
      hudPanel: hudPanelRef.current,
      collapseButton: collapseButtonRef.current,
      airspaceSelect: airspaceSelectRef.current,
      terrainToggle: terrainToggleRef.current,
      weatherToggle: weatherToggleRef.current,
      autoRefreshToggle: autoRefreshToggleRef.current,
      autoRefreshRateInput: autoRefreshRateInputRef.current,
      hoverCard: hoverCardRef.current,
      toastAlert: toastAlertRef.current
    })

    return cleanup
  }, [isViewerReady])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !isViewerReady) {
      return
    }

    audio.pause()
    audio.src = liveAtcStreamUrl
    audio.muted = isAudioMutedRef.current
    audio.volume = DEFAULT_ATC_AUDIO_VOLUME
    audio.load()

    const playPromise = audio.play()
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {})
    }
  }, [isViewerReady, liveAtcStreamUrl])

  async function handleAudioToggle() {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (isAudioMuted) {
      audio.muted = false

      try {
        await audio.play()
        audio.volume = DEFAULT_ATC_AUDIO_VOLUME
        setIsAudioMuted(false)
      } catch {
        audio.muted = true
        setIsAudioMuted(true)
      }

      return
    }

    audio.muted = true
    setIsAudioMuted(true)
  }

  function handleAirspaceChange(event) {
    setSelectedAirspaceId(getAirspacePresetById(event.target.value).id)
  }

  return (
    <div className="app-shell">
      <canvas
        ref={canvasRef}
        id="sceneCanvas"
        aria-label={`3D live ${selectedAirspacePreset.name} flight viewer`}
      />

      <aside ref={hudPanelRef} id="hudPanel" className="hud">
        <div className="hud-header">
          <div className="hud-title">
            <p className="eyebrow">Live ADS-B Sector</p>
            <h1>{selectedAirspacePreset.displayName}</h1>
          </div>
          <div className="hud-header-controls">
            <button
              className={`audio-toggle${isAudioMuted ? " is-muted" : ""}`}
              type="button"
              onClick={handleAudioToggle}
              aria-label={
                isAudioMuted
                  ? "Unmute ATC and advisory audio"
                  : "Mute ATC and advisory audio"
              }
              aria-pressed={!isAudioMuted}
              title={
                isAudioMuted
                  ? "Unmute ATC and advisory audio"
                  : "Mute ATC and advisory audio"
              }
            >
              {isAudioMuted ? "🔇" : "🔊"}
            </button>
            <button
              ref={collapseButtonRef}
              id="collapseButton"
              className="collapse-button"
              type="button"
              aria-expanded="true"
              aria-label="Collapse panel"
            >
              <span className="collapse-button-icon" aria-hidden="true">
                ⌃
              </span>
            </button>
          </div>
        </div>

        <form
          ref={flightSearchFormRef}
          id="flightSearchForm"
          className="flight-search"
          role="search"
        >
          <span className="flight-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            ref={flightSearchInputRef}
            id="flightSearchInput"
            className="flight-search-input"
            type="search"
            placeholder="Search for an aircraft"
            autoComplete="off"
            spellCheck="false"
            aria-label="Search for a flight in view"
          />
        </form>

        <div id="hudContent" className="hud-content">
          <div className="action-row">
            <button
              ref={refreshButtonRef}
              id="refreshButton"
              className="primary-action"
              type="button"
            >
              Refresh
            </button>
            <button
              ref={injectConflictButtonRef}
              id="injectConflictButton"
              className="secondary-action danger-action"
              type="button"
            >
              Conflict
            </button>
            <span
              ref={statusBadgeRef}
              id="statusBadge"
              className="status-badge status-pending"
            >
              Idle
            </span>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Tracked Aircraft</span>
              <strong ref={flightCountRef} id="flightCount" className="stat-value">
                0
              </strong>
            </div>
            <div className="stat-card">
              <span className="stat-label">Last Update</span>
              <strong ref={lastUpdatedRef} id="lastUpdated" className="stat-value">
                Waiting
              </strong>
            </div>
          </div>

          <div className="panel-grid">
            <section className="panel" aria-labelledby="airspace-heading">
              <h2 id="airspace-heading">Airspace</h2>
              <label className="setting-stack setting-stack-first" htmlFor="airspaceSelect">
                <span className="setting-select-wrap">
                  <span className="setting-select-icon" aria-hidden="true">
                    ▾
                  </span>
                  <select
                    ref={airspaceSelectRef}
                    id="airspaceSelect"
                    className="setting-select"
                    value={selectedAirspaceId}
                    onChange={handleAirspaceChange}
                  >
                    {AIRSPACE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {getAirspacePresetLabel(preset)}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
            </section>

            <section className="panel" aria-labelledby="display-heading">
              <h2 id="display-heading">Display</h2>
              <label className="toggle-row">
                <input
                  ref={terrainToggleRef}
                  id="terrainToggle"
                  type="checkbox"
                />
                Terrain map
              </label>
              <label className="toggle-row">
                <input
                  ref={weatherToggleRef}
                  id="weatherToggle"
                  type="checkbox"
                  defaultChecked
                />
                Cloud cover
              </label>
              <label className="toggle-row">
                <input
                  ref={autoRefreshToggleRef}
                  id="autoRefreshToggle"
                  type="checkbox"
                />
                Auto refresh
              </label>
              <label className="setting-row" htmlFor="autoRefreshRateInput">
                <span className="setting-label">Interval</span>
                <input
                  ref={autoRefreshRateInputRef}
                  id="autoRefreshRateInput"
                  className="setting-input"
                  type="number"
                  min="1"
                  max="60"
                  step="1"
                  defaultValue="2"
                  inputMode="numeric"
                />
              </label>
            </section>

            <section className="panel panel-wide" aria-labelledby="aircraft-heading">
              <h2 id="aircraft-heading">Active Aircraft</h2>
              <ol ref={flightListRef} id="flightList" className="flight-list" />
            </section>

            <section className="panel panel-wide" aria-labelledby="notes-heading">
              <h2 id="notes-heading">Feed Notes</h2>
              <p ref={feedNoteRef} id="feedNote" className="feed-note">
                Press Refresh to load the first live traffic snapshot.
              </p>
            </section>
          </div>

        </div>
      </aside>

      <div
        ref={hoverCardRef}
        id="hoverCard"
        className="hover-card hidden"
        aria-hidden="true"
      />
      <div
        ref={toastAlertRef}
        id="toastAlert"
        className="toast-alert severity-info hidden"
        aria-hidden="true"
      />
      <audio
        ref={audioRef}
        src={liveAtcStreamUrl}
        autoPlay
        muted
        playsInline
        preload="none"
        aria-hidden="true"
      />
    </div>
  )
}
