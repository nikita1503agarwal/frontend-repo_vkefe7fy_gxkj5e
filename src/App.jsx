import React, { useEffect, useMemo, useRef, useState } from 'react'
import Spline from '@splinetool/react-spline'

// Utility: format heading to cardinal
function headingToDirection(deg) {
  if (deg == null) return '—'
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']
  const i = Math.round(deg / 22.5) % 16
  return dirs[i]
}

function useDeviceHeading() {
  const [heading, setHeading] = useState(null)
  const [permissionState, setPermissionState] = useState('unknown')
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    let on = false
    const handler = (e) => {
      // iOS Safari
      if (typeof e.webkitCompassHeading === 'number') {
        setHeading(e.webkitCompassHeading)
        return
      }
      // Generic alpha
      if (typeof e.alpha === 'number') {
        const normalized = (360 - e.alpha) % 360
        setHeading(normalized)
      }
    }

    try {
      const needPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'
      if (needPermission) {
        setPermissionState('prompt')
      } else {
        window.addEventListener('deviceorientation', handler, true)
        on = true
      }
    } catch (e) {
      setSupported(false)
    }

    return () => {
      if (on) window.removeEventListener('deviceorientation', handler, true)
    }
  }, [])

  const requestPermission = async () => {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const res = await DeviceOrientationEvent.requestPermission()
        setPermissionState(res)
        if (res === 'granted') {
          window.addEventListener('deviceorientation', (e) => {
            if (typeof e.webkitCompassHeading === 'number') {
              setHeading(e.webkitCompassHeading)
            } else if (typeof e.alpha === 'number') {
              setHeading((360 - e.alpha) % 360)
            }
          }, true)
        }
      } catch (e) {
        setPermissionState('denied')
      }
    }
  }

  return { heading, supported, permissionState, requestPermission }
}

function useGeo() {
  const [coords, setCoords] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported')
      return
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])
  return { coords, error }
}

function useMagnetometer() {
  const [mag, setMag] = useState(null) // microtesla estimate
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    try {
      const M = window.Magnetometer
      if (!M) { setSupported(false); return }
      const sensor = new M({ frequency: 10 })
      sensor.addEventListener('reading', () => {
        // Sensor gives in microtesla typically
        const strength = Math.sqrt((sensor.x||0)**2 + (sensor.y||0)**2 + (sensor.z||0)**2)
        setMag(strength)
      })
      sensor.addEventListener('error', () => setSupported(false))
      sensor.start()
      return () => sensor.stop()
    } catch (e) {
      setSupported(false)
    }
  }, [])
  return { mag, supported }
}

function CompassFace({ mode, heading }) {
  const size = 260
  const rotation = (heading || 0) * Math.PI / 180

  const zones16 = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    start: i * 22.5,
    end: (i + 1) * 22.5,
  })), [])
  const zones32 = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    start: i * 11.25,
    end: (i + 1) * 11.25,
  })), [])

  const chakraDeities = ['Agni','Indra','Vayu','Kubera','Ishanya','Jalad','Varuna','Pitra','Nairitya','Yama','Naga','Apavatsa','Pusha','Brahma','Rudra','Surya']

  const activeIndex = (arr) => {
    if (heading == null) return -1
    const h = (heading % 360 + 360) % 360
    return arr.findIndex(z => h >= z.start && h < z.end)
  }

  const face = () => {
    if (mode === 'normal') {
      return (
        <div className="relative" style={{ width: size, height: size }}>
          <div className="absolute inset-0 rounded-full border-8 border-blue-500" />
          <div className="absolute inset-4 rounded-full border-2 border-gray-200" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-5xl font-bold text-blue-600">{heading != null ? heading.toFixed(0) + '°' : '—'}</div>
          </div>
          {/* N E S W */}
          <div className="absolute left-1/2 -translate-x-1/2 top-2 text-xs font-semibold">N</div>
          <div className="absolute left-1/2 -translate-x-1/2 bottom-2 text-xs font-semibold">S</div>
          <div className="absolute top-1/2 -translate-y-1/2 left-2 text-xs font-semibold">W</div>
          <div className="absolute top-1/2 -translate-y-1/2 right-2 text-xs font-semibold">E</div>
          {/* Needle */}
          <svg className="absolute inset-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <g transform={`translate(${size/2} ${size/2}) rotate(${heading || 0})`}>
              <polygon points={`0,-${size/2 - 16} 8,0 0,16 -8,0`} fill="#ef4444" />
              <circle r="6" fill="#1e40af" />
            </g>
          </svg>
        </div>
      )
    }

    if (mode === '16') {
      const idx = activeIndex(zones16)
      return (
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="absolute inset-0">
            <defs>
              <radialGradient id="g16" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffffff"/>
                <stop offset="100%" stopColor="#e5e7eb"/>
              </radialGradient>
            </defs>
            <circle cx={size/2} cy={size/2} r={size/2 - 4} fill="url(#g16)" stroke="#93c5fd" strokeWidth="8" />
            <g transform={`translate(${size/2} ${size/2}) rotate(${heading || 0})`}>
              {zones16.map((z, i) => (
                <g key={i}>
                  <line x1="0" y1="0" x2="0" y2={-size/2 + 12} stroke={i===idx? '#1e40af':'#94a3b8'} strokeWidth={i===idx? 3:1} transform={`rotate(${i*22.5})`} />
                </g>
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 flex items-end justify-center pb-2">
            <div className="text-sm font-semibold text-blue-700 bg-white/70 px-2 py-1 rounded shadow">
              {heading != null ? `Zone ${(idx+1)} • ${heading.toFixed(0)}°` : '—'}
            </div>
          </div>
        </div>
      )
    }

    if (mode === '32') {
      const idx = activeIndex(zones32)
      const labels = ['Agni','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW','Ishanya','Vayu','Kubera','Varuna','Pitra','Nairitya','Yama','Naga','Apavatsa','Pusha','Brahma','Rudra','Surya','Indra','Jalad','—']
      return (
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="absolute inset-0">
            <circle cx={size/2} cy={size/2} r={size/2 - 4} fill="#fff" stroke="#60a5fa" strokeWidth="8" />
            <g transform={`translate(${size/2} ${size/2}) rotate(${heading || 0})`}>
              {zones32.map((z, i) => (
                <line key={i} x1="0" y1="0" x2="0" y2={-size/2 + 10} stroke={i===idx? '#1d4ed8':'#cbd5e1'} strokeWidth={i===idx? 3:1} transform={`rotate(${i*11.25})`} />
              ))}
            </g>
          </svg>
          <div className="absolute inset-0 flex items-end justify-center pb-2">
            <div className="text-sm font-semibold text-blue-700 bg-white/70 px-2 py-1 rounded shadow">
              {heading != null ? `${labels[idx] || 'Zone'} • ${heading.toFixed(0)}°` : '—'}
            </div>
          </div>
        </div>
      )
    }

    // Applied Chakra (stylized rings + spokes)
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0">
          <defs>
            <radialGradient id="gC" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff"/>
              <stop offset="100%" stopColor="#e0f2fe"/>
            </radialGradient>
          </defs>
          <circle cx={size/2} cy={size/2} r={size/2 - 4} fill="url(#gC)" stroke="#38bdf8" strokeWidth="8" />
          <g transform={`translate(${size/2} ${size/2}) rotate(${heading || 0})`}>
            {Array.from({ length: 32 }).map((_, i) => (
              <line key={i} x1="0" y1="0" x2="0" y2={-size/2 + 12} stroke="#7dd3fc" strokeWidth={i%4===0?2:1} transform={`rotate(${i*11.25})`} />
            ))}
          </g>
          <circle cx={size/2} cy={size/2} r={60} fill="#ffffff" stroke="#bae6fd" />
          <circle cx={size/2} cy={size/2} r={28} fill="#e0f2fe" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-xs text-blue-900 font-semibold">Applied Vastu Chakra</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {face()}
      <div className="text-sm text-gray-700">{heading != null ? `${heading.toFixed(0)}° • ${headingToDirection(heading)}` : 'Move your device to calibrate'}</div>
    </div>
  )
}

export default function App() {
  const { heading, permissionState, requestPermission } = useDeviceHeading()
  const { coords } = useGeo()
  const { mag } = useMagnetometer()

  const [tab, setTab] = useState('home') // home | capture | gallery
  const [mode, setMode] = useState(() => localStorage.getItem('mode') || 'normal')
  const [cameraOn, setCameraOn] = useState(false)
  const [lastCapture, setLastCapture] = useState(() => localStorage.getItem('lastCapture'))

  useEffect(() => { localStorage.setItem('mode', mode) }, [mode])

  // Camera setup
  const videoRef = useRef(null)
  const overlayRef = useRef(null)

  useEffect(() => {
    let stream
    const start = async () => {
      if (!cameraOn) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
      } catch (e) {
        console.warn('Camera error', e)
      }
    }
    start()
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [cameraOn])

  const capture = async () => {
    // Draw video + overlay to canvas
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video) return

    const w = video.videoWidth || 720
    const h = video.videoHeight || 1280
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    try {
      ctx.drawImage(video, 0, 0, w, h)
    } catch {}
    if (overlay) {
      // Render overlay SVG by cloning to an offscreen canvas via foreignObject
      const svg = overlay.querySelector('svg')
      if (svg) {
        const xml = new XMLSerializer().serializeToString(svg)
        const img = new Image()
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        await new Promise((res) => { img.onload = res; img.src = url })
        const size = Math.min(w, h) * 0.7
        ctx.drawImage(img, (w - size)/2, (h - size)/2, size, size)
        URL.revokeObjectURL(url)
      }
    }
    const dataUrl = canvas.toDataURL('image/png')
    localStorage.setItem('lastCapture', dataUrl)
    setLastCapture(dataUrl)
    setTab('gallery')
  }

  const canUseMap = navigator.onLine && coords
  const openMap = () => {
    if (!canUseMap) return
    const url = `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=18/${coords.lat}/${coords.lon}`
    window.open(url, '_blank')
  }

  const TopBar = (
    <div className="flex items-center justify-between gap-3 p-3 bg-white/70 rounded-xl shadow-sm border">
      <button onClick={openMap} disabled={!canUseMap} className={`px-3 py-2 rounded-lg text-sm font-semibold ${canUseMap? 'bg-blue-50 text-blue-700 hover:bg-blue-100':'bg-gray-100 text-gray-400'}`}>Open Map</button>
      <input placeholder="Search Location" className="flex-1 px-3 py-2 rounded-lg border focus:outline-none" />
      <button onClick={() => setCameraOn(v => !v)} className={`px-3 py-2 rounded-lg text-sm font-semibold ${cameraOn? 'bg-red-50 text-red-600 hover:bg-red-100':'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>{cameraOn? 'Camera Off':'Rear Camera'}</button>
    </div>
  )

  const InfoBar = (
    <div className="grid grid-cols-2 gap-3 w-full">
      <div className="p-3 bg-white/70 rounded-xl border text-sm">
        <div className="text-gray-500">Geo-coordinates</div>
        <div className="font-mono">{coords ? `${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}` : '—'}</div>
      </div>
      <div className="p-3 bg-white/70 rounded-xl border text-sm">
        <div className="text-gray-500">Magnetic Field (µT)</div>
        <div className={`font-mono ${mag && mag>60 ? 'text-red-600' : ''}`}>{mag ? mag.toFixed(1) : 'N/A'}</div>
        {mag && mag>60 && <div className="text-xs text-red-600">Magnetic Disturbance Warning</div>}
      </div>
    </div>
  )

  const Hero = (
    <div className="w-full h-48 rounded-xl overflow-hidden bg-white border">
      <Spline scene="https://prod.spline.design/qw5pDw-Wh4PXvDw4/scene.splinecode" />
    </div>
  )

  const ModeSelector = (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-600">Mode</label>
      <select value={mode} onChange={(e)=>setMode(e.target.value)} className="px-3 py-2 rounded-lg border bg-white">
        <option value="normal">Normal Compass</option>
        <option value="16">16 Zone Vastu</option>
        <option value="32">32 Zone Vastu</option>
        <option value="chakra">Applied Vastu Chakra</option>
      </select>
    </div>
  )

  const PermissionBanner = (
    permissionState === 'prompt' ? (
      <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm flex items-center justify-between">
        <div>Allow motion & orientation to enable compass.</div>
        <button onClick={requestPermission} className="px-3 py-2 bg-yellow-100 hover:bg-yellow-200 rounded-lg font-semibold">Grant</button>
      </div>
    ) : null
  )

  const HomeTab = (
    <div className="space-y-4">
      {Hero}
      {TopBar}
      {PermissionBanner}
      <div className="flex items-center justify-between">{ModeSelector}<div className="text-sm text-gray-500">{heading != null ? `${headingToDirection(heading)}` : ''}</div></div>
      <div ref={overlayRef} className="flex items-center justify-center">
        <CompassFace mode={mode} heading={heading} />
      </div>
      {InfoBar}
    </div>
  )

  const CaptureTab = (
    <div className="space-y-4">
      {TopBar}
      <div className="relative w-full aspect-[3/4] bg-black rounded-xl overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted></video>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div ref={overlayRef}>
            <CompassFace mode={mode} heading={heading} />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        {ModeSelector}
        <button onClick={capture} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold">Capture</button>
      </div>
      {InfoBar}
    </div>
  )

  const GalleryTab = (
    <div className="space-y-4">
      <div className="p-3 bg-white/70 rounded-xl border text-sm">Last Captured</div>
      {lastCapture ? (
        <img src={lastCapture} alt="Last capture" className="w-full rounded-xl border" />
      ) : (
        <div className="p-6 text-center text-gray-500 bg-white/70 rounded-xl border">No capture yet</div>
      )}
      <div className="flex gap-2">
        <button onClick={()=>{ if (lastCapture) navigator.clipboard.writeText(lastCapture) }} className="px-3 py-2 bg-gray-100 rounded-lg">Copy Data URL</button>
        <a download={`vastu-capture-${Date.now()}.png`} href={lastCapture || '#'} className={`px-3 py-2 rounded-lg ${lastCapture? 'bg-blue-600 text-white':'bg-gray-200 text-gray-400 pointer-events-none'}`}>Download</a>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-blue-50 text-gray-900">
      <div className="max-w-md mx-auto p-4 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Vastu Compass 360 — Web Prototype</h1>
          <p className="text-sm text-gray-600">Offline-first compass with camera overlay and capture</p>
        </div>

        {tab === 'home' && HomeTab}
        {tab === 'capture' && CaptureTab}
        {tab === 'gallery' && GalleryTab}

        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur border-t">
          <div className="max-w-md mx-auto flex items-center justify-around p-2">
            <button onClick={()=>setTab('home')} className={`px-4 py-2 rounded-lg ${tab==='home'?'bg-blue-600 text-white':'text-gray-700'}`}>Home</button>
            <button onClick={()=>setTab('capture')} className={`px-4 py-2 rounded-lg ${tab==='capture'?'bg-blue-600 text-white':'text-gray-700'}`}>Capture</button>
            <button onClick={()=>setTab('gallery')} className={`px-4 py-2 rounded-lg ${tab==='gallery'?'bg-blue-600 text-white':'text-gray-700'}`}>Last Captured</button>
          </div>
        </nav>
        <div className="h-16" />
      </div>
    </div>
  )
}
