'use client'

// Vendored from `feral-blob` (MIT, github.com/mortspace/feral-blob) and rewritten
// with zero animation libraries: every visual is a plain SVG attribute or CSS
// keyframe computed directly from props, so mood/gaze/nod changes always render.
// Original art + structure preserved; attribution to the original author.

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent } from 'react'

export type JellyBlobMood = 'neutral' | 'happy' | 'sad' | 'angry' | 'hmm' | 'sideEye' | 'password'
export type JellyBlobHappyEyes = 'open' | 'smile' | 'star'
export type JellyBlobMouth = 'open' | 'wide'

export interface JellyBlobMascotProps {
  /** Expression to show. */
  mood?: JellyBlobMood
  /** Eye target — the blob looks toward the point (roughly screen px). Clamped to ±16/±10. */
  gaze?: { x?: number; y?: number; intensity?: number }
  /** Head/body nod loop (e.g. while typing). */
  nod?: boolean
  /** Talking mouth: 'open' (talking, closed oval) or 'wide' (talking, wider). */
  mouth?: JellyBlobMouth
  /** Happy eyes: 'open' = default, 'smile' = happy closed arcs, 'star' = 4-point star glints. */
  happyEyes?: JellyBlobHappyEyes
  /** Nod amplitude multiplier (1 = full). */
  amount?: number
  /** Suppress idle bob/hop animations (used while the blob is "working" in a form). */
  still?: boolean
  className?: string
  /** Fires after the blob is poked 6 times quickly. */
  onOverpoke?: () => void
  onClick?: () => void
}

const BODY_SHAPE =
  'M450 135 C520 137 580 158 618 200 C652 240 672 290 680 345 C686 390 688 425 686 462 C684 505 676 530 658 552 C641 569 627 580 602 583 C578 585 561 578 536 577 C510 576 482 585 450 585 C418 585 390 576 364 577 C339 578 323 585 298 583 C273 580 259 569 242 552 C224 530 216 505 214 462 C212 425 214 390 220 345 C228 290 248 240 282 200 C320 158 380 137 450 135 Z'
const SAD_SHAPE =
  'M450 168 C516 169 568 188 604 222 C640 258 662 308 672 364 C678 408 682 444 680 482 C678 522 668 548 646 566 C628 582 606 590 580 590 C554 590 530 582 504 583 C482 584 467 593 450 593 C433 593 418 584 396 583 C370 582 346 590 320 590 C294 590 272 582 254 566 C232 548 222 522 220 482 C218 444 222 408 228 364 C238 308 260 258 296 222 C332 188 384 169 450 168 Z'

const BODY_PATHS: Record<JellyBlobMood, string> = {
  sideEye: BODY_SHAPE,
  password: BODY_SHAPE,
  hmm: BODY_SHAPE,
  neutral: BODY_SHAPE,
  happy: BODY_SHAPE,
  sad: SAD_SHAPE,
  angry: BODY_SHAPE,
}

const NEUTRAL_TOP =
  'M450 135 C520 137 580 158 618 200 C652 240 672 290 680 345 C686 390 688 425 686 462'
const NEUTRAL_BOTTOM: ReadonlyArray<readonly [number, number]> = [
  [684, 505], [676, 530], [658, 552],
  [641, 569], [627, 580], [602, 583],
  [578, 585], [561, 578], [536, 577],
  [510, 576], [482, 585], [450, 585],
  [418, 585], [390, 576], [364, 577],
  [339, 578], [323, 585], [298, 583],
  [273, 580], [259, 569], [242, 552],
  [224, 530], [216, 505], [214, 462],
  [212, 425], [214, 390], [220, 345],
  [228, 290], [248, 240], [282, 200],
  [320, 158], [380, 137], [450, 135],
]
const RIPPLE_AMP = 10
const SLOSH_AMP = 4
const WOBBLE_K = 0.016
const lowness = (y: number) => Math.max(0, Math.min(1, (y - 440) / 145))
const legBias = (x: number) => 0.3 + 0.7 * Math.min(1, Math.abs(x - 450) / 150)
function bottomWave(phase: number, amt = 1): string {
  let d = NEUTRAL_TOP
  for (let i = 0; i < NEUTRAL_BOTTOM.length; i += 3) {
    const seg = NEUTRAL_BOTTOM.slice(i, i + 3)
      .map(([x, y]) => {
        const w = lowness(y) * legBias(x) * amt
        const px = x + w * (SLOSH_AMP * Math.sin(phase) + RIPPLE_AMP * 0.22 * Math.cos(WOBBLE_K * x + phase))
        const py = y + w * RIPPLE_AMP * Math.sin(WOBBLE_K * x + phase)
        return `${px.toFixed(1)} ${py.toFixed(1)}`
      })
      .join(' ')
    d += ` C${seg}`
  }
  return `${d} Z`
}
function lerpPath(a: string, b: string, t: number): string {
  if (t <= 0.0001) return a
  if (t >= 0.9999) return b
  const nb = b.match(/-?\d+(?:\.\d+)?/g) ?? []
  let i = 0
  return a.replace(/-?\d+(?:\.\d+)?/g, (na) => (parseFloat(na) + (parseFloat(nb[i++] ?? na) - parseFloat(na)) * t).toFixed(1))
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const IDLE_MOODS = new Set<JellyBlobMood>(['neutral', 'hmm', 'sideEye', 'password'])

const MOUTH_PATHS: Record<JellyBlobMood, string> = {
  sideEye: 'M432 418 C445 418 461 415 474 409',
  password: 'M452 416 C452 416 452 416 452 416',
  hmm: 'M431 418 C443 420 461 414 473 411',
  neutral: 'M431 409 C437 429 466 429 473 409',
  happy: 'M420 402 C435 448 470 448 485 402',
  sad: 'M431 424 C440 414 464 414 473 424',
  angry: 'M431 416 C443 422 461 422 473 416',
}

const TALK_MOUTH_PATHS: Record<'open' | 'wide', string[]> = {
  open: [
    'M441 410 C447 405 457 405 463 410 C466 417 462 424 452 424 C442 424 438 417 441 410 Z',
    'M436 408 C443 400 462 400 469 408 C474 421 466 434 452 434 C438 434 431 421 436 408 Z',
    'M439 413 C445 408 461 408 467 413 C469 423 463 430 452 430 C441 430 435 423 439 413 Z',
    'M434 411 C441 404 464 404 471 411 C474 422 466 432 452 432 C438 432 431 422 434 411 Z',
    'M441 410 C447 405 457 405 463 410 C466 417 462 424 452 424 C442 424 438 417 441 410 Z',
  ],
  wide: [
    'M438 410 C445 404 460 404 467 410 C472 421 465 432 452 432 C439 432 433 421 438 410 Z',
    'M431 407 C440 398 465 398 474 407 C481 424 469 439 452 439 C435 439 424 424 431 407 Z',
    'M428 413 C438 404 467 404 477 413 C479 426 468 435 452 435 C436 435 426 426 428 413 Z',
    'M434 409 C442 401 463 401 471 409 C477 423 467 437 452 437 C437 437 428 423 434 409 Z',
    'M438 410 C445 404 460 404 467 410 C472 421 465 432 452 432 C439 432 433 421 438 410 Z',
  ],
}

type Pose = { x?: number; y?: number; rotate?: number; scaleX?: number; scaleY?: number; skewX?: number }
const IDENTITY: Pose = {}

// body-group pose (mood snap). Idle bobbing lives in CSS keyframes on a nested group.
const BODY_POSES: Record<JellyBlobMood, Pose> = {
  sideEye: { x: -4, y: 1, rotate: -1.2 },
  password: IDENTITY,
  hmm: { skewX: 2.5 },
  neutral: IDENTITY,
  happy: IDENTITY,
  sad: IDENTITY,
  angry: { y: 5, scaleY: 0.95 },
}
const BODY_BOB: Partial<Record<JellyBlobMood, 'fb-body-bob' | 'fb-body-bob-pw' | 'fb-hop'>> = {
  neutral: 'fb-body-bob',
  password: 'fb-body-bob-pw',
  happy: 'fb-hop',
}

const FACE_POSES: Record<JellyBlobMood, Pose> = {
  sideEye: { x: -7, y: 2, rotate: -2, scaleX: 1, scaleY: 0.98 },
  password: { x: -4, y: 3, rotate: -3 },
  hmm: IDENTITY,
  neutral: IDENTITY,
  happy: IDENTITY,
  sad: { y: 12 },
  angry: { y: 7, scaleY: 0.96 },
}
const FACE_BOB: Partial<Record<JellyBlobMood, string>> = { neutral: 'fb-face-bob', happy: 'fb-hop' }

const LEFT_ARM_POSES: Record<JellyBlobMood, Pose> = {
  sideEye: IDENTITY,
  password: { rotate: -2 },
  hmm: IDENTITY,
  neutral: IDENTITY,
  happy: { rotate: -8 },
  sad: { y: 13, rotate: 12, scaleX: 0.96, scaleY: 0.96 },
  angry: { y: 2, rotate: -3 },
}
const RIGHT_ARM_POSES: Record<JellyBlobMood, Pose> = {
  sideEye: IDENTITY,
  password: { rotate: 2 },
  hmm: IDENTITY,
  neutral: IDENTITY,
  happy: { rotate: 8 },
  sad: { y: 13, rotate: -12, scaleX: 0.96, scaleY: 0.96 },
  angry: { y: 2, rotate: 3 },
}
const ARM_BOB: Partial<Record<JellyBlobMood, 'fb-arm-hop'>> = { happy: 'fb-arm-hop' }

type ArmNudge = { dx: number; dy: number; rot: number }
const ARM_REST_POSES: ReadonlyArray<{ l: ArmNudge; r: ArmNudge }> = [
  { l: { dx: -2, dy: 3, rot: -5 }, r: { dx: 2, dy: -2, rot: 3 } },
  { l: { dx: 1, dy: -3, rot: 5 }, r: { dx: -2, dy: 4, rot: -6 } },
  { l: { dx: -3, dy: 4, rot: -4 }, r: { dx: 1, dy: 1, rot: 6 } },
  { l: { dx: 3, dy: -1, rot: 6 }, r: { dx: -3, dy: 2, rot: -3 } },
  { l: { dx: -1, dy: 2, rot: -6 }, r: { dx: 2, dy: -3, rot: 4 } },
  { l: { dx: 2, dy: 5, rot: 3 }, r: { dx: -2, dy: -2, rot: -5 } },
]
const LEFT_ARM_PIVOT = '229 407'
const RIGHT_ARM_PIVOT = '671 407'

const HIGHLIGHT_POSES: Record<JellyBlobMood, Pose> = {
  sideEye: IDENTITY, password: IDENTITY, hmm: IDENTITY, neutral: IDENTITY, happy: IDENTITY,
  sad: { y: 20, scaleX: 1.02, scaleY: 0.98 },
  angry: IDENTITY,
}
const HEAD_HIGHLIGHT_POSES: Record<JellyBlobMood, Pose> = {
  sideEye: IDENTITY, password: IDENTITY, hmm: IDENTITY, neutral: IDENTITY, happy: IDENTITY,
  sad: { y: 22, scaleX: 0.96, scaleY: 0.96 },
  angry: IDENTITY,
}
const HEAD_HIGHLIGHT_OPACITY: Record<JellyBlobMood, number> = {
  sideEye: 0.86, password: 0.88, hmm: 0.9, neutral: 0.92, happy: 0.95, sad: 0.9, angry: 0.86,
}

const EYE_TRANSFORMS: Record<JellyBlobMood, Pose> = {
  sideEye: { scaleX: 1.04, scaleY: 0.64, y: 3 },
  password: { scaleX: 0.9, scaleY: 0.38, y: 3 },
  hmm: { scaleX: 1.0, scaleY: 0.78, y: 2 },
  neutral: { scaleY: 1, y: 0 },
  happy: { scaleX: 1.05, scaleY: 1.04, y: -2 },
  sad: { scaleX: 1.1, scaleY: 1.16, y: 4 },
  angry: { scaleX: 1.1, scaleY: 0.48, y: 2 },
}

const CHEEK_POSES: Record<JellyBlobMood, Pose> = {
  sideEye: { x: -3, y: 3, scaleX: 0.9, scaleY: 0.82 },
  password: { x: 0, y: 2, scaleX: 0.86, scaleY: 0.76 },
  hmm: IDENTITY,
  neutral: IDENTITY,
  happy: { y: -1, scaleX: 1.1, scaleY: 1.1 },
  sad: { y: 8, scaleX: 1.04, scaleY: 0.8 },
  angry: { y: 2, scaleX: 1.08, scaleY: 0.94 },
}
const CHEEK_OPACITY: Record<JellyBlobMood, number> = {
  sideEye: 0.48, password: 0.38, hmm: 0.7, neutral: 0.76, happy: 0.88, sad: 0.72, angry: 0.9,
}

const LEFT_EYE_MOOD: Record<JellyBlobMood, Pose> = {
  sideEye: { x: -5, y: 1 }, password: { x: -3, y: 0 }, hmm: { x: -9, y: 1 }, neutral: IDENTITY,
  happy: { y: -1 }, sad: { x: 5, y: 5 }, angry: { x: 3, y: 3 },
}
const RIGHT_EYE_MOOD: Record<JellyBlobMood, Pose> = {
  sideEye: { x: -10, y: 1 }, password: { x: -3, y: 0 }, hmm: { x: -9, y: 1 }, neutral: IDENTITY,
  happy: { y: -1 }, sad: { x: -5, y: 5 }, angry: { x: -3, y: 3 },
}

const SHADOW_1: Record<JellyBlobMood, { rx: number; ry: number; opacity: number }> = {
  neutral: { rx: 212, ry: 31, opacity: 0.46 },
  happy: { rx: 152, ry: 22, opacity: 0.28 },
  sad: { rx: 248, ry: 36, opacity: 0.52 },
  hmm: { rx: 218, ry: 31, opacity: 0.42 },
  sideEye: { rx: 216, ry: 31, opacity: 0.4 },
  password: { rx: 238, ry: 34, opacity: 0.5 },
  angry: { rx: 238, ry: 34, opacity: 0.5 },
}
const SHADOW_2: Record<JellyBlobMood, { rx: number; ry: number; opacity: number }> = {
  neutral: { rx: 137, ry: 15, opacity: 0.14 },
  happy: { rx: 104, ry: 12, opacity: 0.08 },
  hmm: { rx: 136, ry: 15, opacity: 0.12 },
  sideEye: { rx: 134, ry: 15, opacity: 0.12 },
  sad: { rx: 158, ry: 18, opacity: 0.16 },
  password: { rx: 156, ry: 18, opacity: 0.15 },
  angry: { rx: 156, ry: 18, opacity: 0.15 },
}

const EFFECT_OPACITY: Record<JellyBlobMood, number> = {
  happy: 1, sad: 1, angry: 1,
  sideEye: 0, password: 0, hmm: 0, neutral: 0,
}

// CSS-attribute builder: keep translate/skew/scale/rotate in the order framer-motion used.
function poseTransform(p: Pose): string | undefined {
  const parts: string[] = []
  if (p.x || p.y) parts.push(`translate(${p.x ?? 0} ${p.y ?? 0})`)
  if (p.skewX) parts.push(`skewX(${p.skewX})`)
  if (p.scaleX !== undefined || p.scaleY !== undefined) parts.push(`scale(${p.scaleX ?? 1} ${p.scaleY ?? 1})`)
  if (p.rotate) parts.push(`rotate(${p.rotate})`)
  return parts.length ? parts.join(' ') : undefined
}

// plain style used where framer-motion previously animated via MotionValue styles
const centerStyle: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center' }
const bodyOriginStyle: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center bottom' }
const nodOriginStyle: CSSProperties = { transformBox: 'fill-box', transformOrigin: 'center 78%' }

const POKE_LIMIT = 6
const POKE_WINDOW = 2500

export function JellyBlobMascot({
  mood = 'neutral',
  className,
  onOverpoke,
  happyEyes = 'star',
  gaze = { x: 0, y: 0 },
  mouth,
  nod = false,
  amount = 1,
  still = false,
  onClick,
}: JellyBlobMascotProps) {
  const uid = useId().replace(/:/g, '')
  const bodyFill = `${uid}-bodyFill`
  const bodyEdge = `${uid}-bodyEdge`
  const armFill = `${uid}-armFill`
  const cheekFill = `${uid}-cheekFill`
  const eyeFill = `${uid}-eyeFill`
  const shadowFill = `${uid}-shadowFill`
  const bellyGlow = `${uid}-bellyGlow`
  const bodyClip = `${uid}-bodyClip`
  const shadowBlur = `${uid}-shadowBlur`
  const softBlur = `${uid}-softBlur`
  const wideSoftBlur = `${uid}-wideSoftBlur`
  const goo = `${uid}-goo`

  // ── body slosh + mood morph, driven by a rAF loop writing `d` straight to the DOM ──
  const bodyPathRef = useRef<SVGPathElement>(null)
  const clipPathRef = useRef<SVGPathElement>(null)
  const dRef = useRef(bottomWave(0))
  const moodRef = useRef(mood)
  const fromRef = useRef(dRef.current)
  const morphRef = useRef(1)
  const phaseRef = useRef(0)
  const amtRef = useRef(IDLE_MOODS.has(mood) ? 1 : 0)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    fromRef.current = dRef.current
    morphRef.current = 0
    moodRef.current = mood
  }, [mood])

  useEffect(() => {
    let raf = 0
    let last = 0
    const PHASE_SPEED = 0.7
    const MORPH_RATE = 2.4
    const AMT_RATE = 2.2
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
      last = now
      const idle = IDLE_MOODS.has(moodRef.current)
      phaseRef.current += dt * PHASE_SPEED
      amtRef.current += ((idle ? 1 : 0) - amtRef.current) * Math.min(1, dt * AMT_RATE)
      const rest = idle ? bottomWave(phaseRef.current, amtRef.current) : BODY_PATHS[moodRef.current]
      morphRef.current = Math.min(1, morphRef.current + dt * MORPH_RATE)
      const d = morphRef.current >= 1 ? rest : lerpPath(fromRef.current, rest, easeInOut(morphRef.current))
      dRef.current = d
      if (bodyPathRef.current) bodyPathRef.current.setAttribute('d', d)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    clipPathRef.current?.setAttribute('d', BODY_PATHS[mood])
  }, [mood])

  // ── talking mouth cycles its shape on a plain interval ──
  const [talkIdx, setTalkIdx] = useState(0)
  useEffect(() => {
    if (!mouth) return
    const id = window.setInterval(() => setTalkIdx((i) => (i + 1) % 5), 560)
    return () => window.clearInterval(id)
  }, [mouth])

  // ── poke easter egg ──
  const [booping, setBooping] = useState(false)
  const [shaking, setShaking] = useState(false)
  const pokes = useRef(0)
  const tallyTimer = useRef(0)
  const onOverpokeRef = useRef(onOverpoke)
  onOverpokeRef.current = onOverpoke
  const onBoop = (e: PointerEvent<SVGSVGElement>) => {
    setBooping(true)
    window.setTimeout(() => setBooping(false), 500)
    pokes.current += 1
    window.clearTimeout(tallyTimer.current)
    tallyTimer.current = window.setTimeout(() => {
      pokes.current = 0
    }, POKE_WINDOW)
    if (pokes.current >= POKE_LIMIT) {
      pokes.current = 0
      setShaking(true)
      window.setTimeout(() => setShaking(false), 850)
      onOverpokeRef.current?.()
    }
    onClick?.()
    e.stopPropagation()
  }
  useEffect(() => () => window.clearTimeout(tallyTimer.current), [])

  // ── arm rest pose picked once on mount (seeded from uid so SSR/hydration agree) ──
  const armRest = useRef<{ left: string; right: string } | null>(null)
  if (!armRest.current) {
    let seed = 0
    for (let i = 0; i < uid.length; i++) seed = (seed + uid.charCodeAt(i)) % 0xffff
    const p = ARM_REST_POSES[seed % ARM_REST_POSES.length]
    armRest.current = {
      left: `translate(${p.l.dx} ${p.l.dy}) rotate(${p.l.rot} ${LEFT_ARM_PIVOT})`,
      right: `translate(${p.r.dx} ${p.r.dy}) rotate(${p.r.rot} ${RIGHT_ARM_PIVOT})`,
    }
  }

  // ── gaze math (mirrors the original) ──
  const gazeX = Math.max(-16, Math.min(18, gaze.x ?? 0))
  const gazeY = Math.max(-10, Math.min(10, gaze.y ?? 0))
  const gazeAmount = Math.min(1, Math.hypot(gazeX, gazeY) / 16) * amount
  const attentionX = gazeX * 0.18
  const attentionY = gazeY * 0.08 + gazeAmount * 1.5
  const glossX = gazeX * -0.08
  const glossY = gazeY * 0.04

  const idleBob = still ? undefined : BODY_BOB[mood]
  const faceBob = still ? undefined : FACE_BOB[mood]
  const armBob = still ? undefined : ARM_BOB[mood]

  const eyesHidden = (mood === 'happy' && happyEyes === 'smile') || mood === 'password' || mood === 'sideEye'
  const starMode = mood === 'happy' && happyEyes === 'star'
  const smileMode = mood === 'happy' && happyEyes === 'smile'

  const bodyTransform = poseTransform(BODY_POSES[mood])
  const faceTransform = poseTransform(FACE_POSES[mood])

  const lEyeT = poseTransform(LEFT_EYE_MOOD[mood])
  const rEyeT = poseTransform(RIGHT_EYE_MOOD[mood])
  const eyeShapeT = poseTransform(EYE_TRANSFORMS[mood])
  const cheekT = poseTransform(CHEEK_POSES[mood])
  const hiT = poseTransform(HIGHLIGHT_POSES[mood])
  const headHiT = poseTransform(HEAD_HIGHLIGHT_POSES[mood])

  const shadow1 = SHADOW_1[mood]
  const shadow2 = SHADOW_2[mood]
  const effectOpacity = EFFECT_OPACITY[mood]
  const mouthD = MOUTH_PATHS[mood]
  const talkD = mouth ? TALK_MOUTH_PATHS[mouth === 'wide' ? 'wide' : 'open'][talkIdx] : TALK_MOUTH_PATHS.open[0]

  const armPoseStyle = (p: Pose): CSSProperties | undefined => poseTransform(p)
    ? { ...centerStyle, transform: poseTransform(p) }
    : undefined

  return (
    <svg
      className={className}
      viewBox="0 0 900 720"
      role="img"
      aria-label={`Jelly blob mascot, ${mood}`}
      onPointerDown={onBoop}
      style={{ display: 'block', overflow: 'visible', cursor: 'pointer' }}
    >
      <defs>
        <radialGradient id={bodyFill} cx="345" cy="192" r="520" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--jelly-body-top, #ecb8ff)" />
          <stop offset="0.32" stopColor="var(--jelly-body-mid, #c57af3)" />
          <stop offset="0.67" stopColor="var(--jelly-body-deep, #a662e8)" />
          <stop offset="1" stopColor="var(--jelly-body-rim, #d292fb)" />
        </radialGradient>

        <linearGradient id={bodyEdge} x1="215" y1="150" x2="735" y2="600" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--jelly-outline-light, #b66af0)" />
          <stop offset="0.55" stopColor="var(--jelly-outline, #8d52de)" />
          <stop offset="1" stopColor="var(--jelly-outline-light, #ad62ea)" />
        </linearGradient>

        <radialGradient id={armFill} cx="0.45" cy="0.25" r="0.8">
          <stop offset="0" stopColor="var(--jelly-arm-light, #e1a8ff)" />
          <stop offset="0.55" stopColor="var(--jelly-arm-mid, #bc78ed)" />
          <stop offset="1" stopColor="var(--jelly-arm-deep, #9c5de2)" />
        </radialGradient>

        <radialGradient id={cheekFill} cx="0.34" cy="0.28" r="0.78">
          <stop offset="0" stopColor="var(--jelly-cheek-light, #ffc5e2)" />
          <stop offset="0.6" stopColor="var(--jelly-cheek, #f68fc8)" />
          <stop offset="1" stopColor="var(--jelly-cheek-deep, #e87cb9)" />
        </radialGradient>

        <radialGradient id={eyeFill} cx="0.34" cy="0.24" r="0.8">
          <stop offset="0" stopColor="var(--jelly-eye-light, #37204b)" />
          <stop offset="0.55" stopColor="var(--jelly-eye, #170d25)" />
          <stop offset="1" stopColor="var(--jelly-eye-deep, #0d0715)" />
        </radialGradient>

        <radialGradient id={shadowFill} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--jelly-shadow, var(--jelly-outline, #9e57df))" stopOpacity="0.38" />
          <stop offset="0.58" stopColor="var(--jelly-shadow-light, var(--jelly-outline-light, #b46df0))" stopOpacity="0.17" />
          <stop offset="1" stopColor="var(--jelly-shadow-light, var(--jelly-outline-light, #b46df0))" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={bellyGlow} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--jelly-belly-glow, #ffb2dc)" stopOpacity="0.5" />
          <stop offset="0.7" stopColor="var(--jelly-belly-glow, #ffb2dc)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--jelly-belly-glow, #ffb2dc)" stopOpacity="0" />
        </radialGradient>

        <clipPath id={bodyClip} clipPathUnits="userSpaceOnUse">
          <path ref={clipPathRef} d={BODY_PATHS[mood]} />
        </clipPath>

        <filter id={shadowBlur} x="-40%" y="-80%" width="180%" height="260%">
          <feGaussianBlur stdDeviation="16" />
        </filter>

        <filter id={softBlur} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>

        <filter id={wideSoftBlur} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="14" />
        </filter>

        <filter id={goo} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feColorMatrix
            in="blur"
            mode="matrix"
            values="
              1 0 0 0 0
              0 1 0 0 0
              0 0 1 0 0
              0 0 0 20 -10"
            result="goo"
          />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>

      <g id="bottom-shadow-glow">
        <ellipse cx="450" cy="600" rx={shadow1.rx} ry={shadow1.ry} opacity={shadow1.opacity} fill={`url(#${shadowFill})`} filter={`url(#${shadowBlur})`} />
        <ellipse cx="450" cy="593" rx={shadow2.rx} ry={shadow2.ry} opacity={shadow2.opacity} fill="var(--jelly-shadow, var(--jelly-outline, #9855dd))" filter={`url(#${softBlur})`} />
      </g>

      <g
        style={{
          ...bodyOriginStyle,
          transform: `translate(${attentionX} ${attentionY})`,
          animation: shaking ? 'fb-shake 0.8s ease-in-out' : booping ? 'fb-booped 0.5s ease-out' : undefined,
        }}
      >
        <g id="typing-nod" style={nod ? { ...nodOriginStyle, animation: 'fb-nod 1.18s ease-in-out infinite' } : undefined}>
          <g id="arms">
            <g transform={armRest.current!.left}>
              <g style={armPoseStyle(LEFT_ARM_POSES[mood])}>
                {armBob && (
                  <g className={armBob} style={bodyOriginStyle}>
                    <path
                      id="left-arm-base"
                      d="M216 380 C195 380 180 396 180 416 C180 438 195 452 216 452 C237 452 250 438 250 416 C250 396 237 380 216 380 Z"
                      fill={`url(#${armFill})`}
                      stroke="var(--jelly-arm-deep, #9c5de2)"
                      strokeWidth="5.5"
                      strokeLinejoin="round"
                    />
                    <path id="left-arm-inner-shadow" d="M234 396 C214 402 208 428 220 446" fill="none" stroke="var(--jelly-arm-deep, #8d54db)" strokeWidth="9" strokeLinecap="round" opacity="0.14" filter={`url(#${softBlur})`} />
                    <ellipse id="left-arm-small-highlight" cx="196" cy="405" rx="5.6" ry="9" fill="#ffffff" opacity="0.6" transform="rotate(24 196 405)" />
                  </g>
                )}
                {!armBob && (
                  <>
                    <path
                      id="left-arm-base"
                      d="M216 380 C195 380 180 396 180 416 C180 438 195 452 216 452 C237 452 250 438 250 416 C250 396 237 380 216 380 Z"
                      fill={`url(#${armFill})`}
                      stroke="var(--jelly-arm-deep, #9c5de2)"
                      strokeWidth="5.5"
                      strokeLinejoin="round"
                    />
                    <path id="left-arm-inner-shadow" d="M234 396 C214 402 208 428 220 446" fill="none" stroke="var(--jelly-arm-deep, #8d54db)" strokeWidth="9" strokeLinecap="round" opacity="0.14" filter={`url(#${softBlur})`} />
                    <ellipse id="left-arm-small-highlight" cx="196" cy="405" rx="5.6" ry="9" fill="#ffffff" opacity="0.6" transform="rotate(24 196 405)" />
                  </>
                )}
              </g>
            </g>

            <g transform={armRest.current!.right}>
              <g style={armPoseStyle(RIGHT_ARM_POSES[mood])}>
                {armBob && (
                  <g className={armBob} style={bodyOriginStyle}>
                    <path
                      id="right-arm-base"
                      d="M684 380 C705 380 720 396 720 416 C720 438 705 452 684 452 C663 452 650 438 650 416 C650 396 663 380 684 380 Z"
                      fill={`url(#${armFill})`}
                      stroke="var(--jelly-arm-deep, #9c5de2)"
                      strokeWidth="5.5"
                      strokeLinejoin="round"
                    />
                    <path id="right-arm-inner-shadow" d="M666 396 C686 402 692 428 680 446" fill="none" stroke="var(--jelly-arm-deep, #8d54db)" strokeWidth="9" strokeLinecap="round" opacity="0.14" filter={`url(#${softBlur})`} />
                    <ellipse id="right-arm-small-highlight" cx="704" cy="405" rx="5.6" ry="9" fill="#ffffff" opacity="0.6" transform="rotate(-24 704 405)" />
                  </g>
                )}
                {!armBob && (
                  <>
                    <path
                      id="right-arm-base"
                      d="M684 380 C705 380 720 396 720 416 C720 438 705 452 684 452 C663 452 650 438 650 416 C650 396 663 380 684 380 Z"
                      fill={`url(#${armFill})`}
                      stroke="var(--jelly-arm-deep, #9c5de2)"
                      strokeWidth="5.5"
                      strokeLinejoin="round"
                    />
                    <path id="right-arm-inner-shadow" d="M666 396 C686 402 692 428 680 446" fill="none" stroke="var(--jelly-arm-deep, #8d54db)" strokeWidth="9" strokeLinecap="round" opacity="0.14" filter={`url(#${softBlur})`} />
                    <ellipse id="right-arm-small-highlight" cx="704" cy="405" rx="5.6" ry="9" fill="#ffffff" opacity="0.6" transform="rotate(-24 704 405)" />
                  </>
                )}
              </g>
            </g>
          </g>

          <g id="body" transform={bodyTransform}>
            <g style={idleBob ? { ...bodyOriginStyle, animation: `fb-bob ${idleBob === 'fb-hop' ? '1.05s' : '4.2s'} ease-in-out infinite` } : undefined}>
              <path ref={bodyPathRef} id="body-main-shape" d={dRef.current} fill={`url(#${bodyFill})`} stroke={`url(#${bodyEdge})`} strokeWidth="5.8" strokeLinejoin="round" />

              <g id="body-shading-clipped" clipPath={`url(#${bodyClip})`}>
                <path id="left-inner-shine" d="M300 210C262 300 258 430 286 512" fill="none" stroke="#ffffff" strokeWidth="22" strokeLinecap="round" opacity="0.13" filter={`url(#${wideSoftBlur})`} />
                <path id="right-inner-shade" d="M672 270C698 360 684 500 616 548" fill="none" stroke="var(--jelly-outline, #7e47cf)" strokeWidth="24" strokeLinecap="round" opacity="0.14" filter={`url(#${wideSoftBlur})`} />
                <ellipse id="top-soft-sheen" cx="470" cy="175" rx="92" ry="27" fill="#ffffff" opacity="0.14" transform="rotate(1 470 175)" filter={`url(#${softBlur})`} />
                <ellipse id="right-body-shine" cx="592" cy="252" rx="16" ry="36" fill="#ffffff" opacity="0.14" transform="rotate(-26 592 252)" filter={`url(#${softBlur})`} />
              </g>

              <g id="lower-jelly-belly" style={hiT ? { ...centerStyle, transform: hiT } : undefined}>
                <ellipse id="bottom-belly-glow" cx="450" cy="504" rx="240" ry="62" fill={`url(#${bellyGlow})`} opacity="0.95" />
              </g>

              <g id="highlights" style={headHiT ? { ...centerStyle, transform: headHiT, opacity: HEAD_HIGHLIGHT_OPACITY[mood] } : { opacity: HEAD_HIGHLIGHT_OPACITY[mood] }}>
                <g id="head-gloss" style={{ opacity: HEAD_HIGHLIGHT_OPACITY[mood] }}>
                  <g id="head-gloss-gaze" transform={`translate(${glossX} ${glossY})`}>
                    <ellipse id="large-highlight" cx="372" cy="212" rx="37" ry="21" fill="#ffffff" opacity="0.9" transform="rotate(-36 372 212)" />
                    <g id="small-highlights">
                      <circle id="small-head-highlight" cx="320" cy="268" r="12" fill="#ffffff" opacity="0.86" />
                      <circle id="top-dot-highlight" cx="424" cy="172" r="10" fill="#ffffff" opacity={mood === 'sad' ? 0 : 0.84} />
                    </g>
                  </g>
                </g>
                <ellipse id="left-side-faint-gloss" cx="252" cy="470" rx="17" ry="56" fill="#ffffff" opacity="0.09" transform="rotate(-6 252 470)" filter={`url(#${softBlur})`} />
                <ellipse id="right-side-faint-gloss" cx="648" cy="470" rx="17" ry="56" fill="#ffffff" opacity="0.09" transform="rotate(8 648 470)" filter={`url(#${softBlur})`} />
              </g>
            </g>
          </g>

          <g id="face" style={faceTransform ? { ...centerStyle, transform: faceTransform } : undefined}>
            <g style={faceBob ? { ...centerStyle, animation: `fb-bob ${faceBob === 'fb-hop' ? '1.05s' : '3.2s'} ease-in-out infinite` } : undefined}>
              <g id="left-cheek" style={cheekT ? { ...centerStyle, transform: cheekT, opacity: CHEEK_OPACITY[mood] } : { opacity: CHEEK_OPACITY[mood] }}>
                <ellipse id="left-cheek-base" cx="309" cy="430" rx="35" ry="23" fill={`url(#${cheekFill})`} opacity="0.82" />
                <ellipse id="left-cheek-highlight-large" cx="294" cy="421" rx="6.2" ry="4.2" fill="#ffffff" opacity="0.44" transform="rotate(-20 294 421)" />
                <ellipse id="left-cheek-highlight-small" cx="319" cy="420" rx="5.8" ry="4" fill="#ffffff" opacity="0.36" transform="rotate(22 319 420)" />
              </g>

              <g id="right-cheek" style={cheekT ? { ...centerStyle, transform: cheekT, opacity: CHEEK_OPACITY[mood] } : { opacity: CHEEK_OPACITY[mood] }}>
                <ellipse id="right-cheek-base" cx="617" cy="430" rx="35" ry="23" fill={`url(#${cheekFill})`} opacity="0.82" />
                <ellipse id="right-cheek-highlight-large" cx="602" cy="421" rx="6.2" ry="4.2" fill="#ffffff" opacity="0.44" transform="rotate(-20 602 421)" />
                <ellipse id="right-cheek-highlight-small" cx="627" cy="420" rx="5.8" ry="4" fill="#ffffff" opacity="0.36" transform="rotate(22 627 420)" />
              </g>

              <g id="eyes" transform={`translate(${gazeX} ${gazeY})`}>
                <g id="left-eye" style={lEyeT ? { ...centerStyle, transform: lEyeT } : undefined}>
                  <g style={{ opacity: eyesHidden ? 0 : 1 }}>
                    <g style={eyeShapeT ? { ...centerStyle, transform: eyeShapeT } : undefined}>
                      <g className="fb-blink" style={centerStyle}>
                        <ellipse id="left-eye-base" cx="353" cy="371" rx="32" ry="39" fill={`url(#${eyeFill})`} />
                        <ellipse id="left-eye-lower-shade" cx="353" cy="393" rx="23" ry="12" fill="var(--jelly-eye-light, #2a1640)" opacity="0.3" />
                        <circle id="left-eye-main-highlight" cx="364" cy="353" r="10.5" fill="#ffffff" opacity={starMode ? 0 : 0.96} />
                        <path
                          id="left-eye-star"
                          d="M364 340 C366.4 349.4 367.6 350.6 377 353 C367.6 355.4 366.4 356.6 364 366 C361.6 356.6 360.4 355.4 351 353 C360.4 350.6 361.6 349.4 364 340 Z"
                          fill="#ffffff"
                          opacity={starMode ? 1 : 0}
                          style={starMode ? { ...centerStyle, transform: 'scale(1)' } : { ...centerStyle, transform: 'scale(0.5)', opacity: 0 }}
                        />
                        <circle id="left-eye-secondary-highlight" cx="359" cy="347" r="3.2" fill="#ffffff" opacity="0.58" />
                        <circle id="left-eye-violet-sparkle" cx="339" cy="391" r="5.8" fill="var(--jelly-eye-sparkle, #b471e6)" opacity="0.62" />
                      </g>
                    </g>
                  </g>
                  <path
                    id="left-eye-happy-arc"
                    d="M325 380 C341 330 365 330 381 380"
                    fill="none"
                    stroke={`url(#${eyeFill})`}
                    strokeWidth="11"
                    strokeLinecap="round"
                    opacity={smileMode ? 1 : 0}
                    style={{ ...centerStyle, transformBox: 'fill-box', transformOrigin: 'center bottom', transform: smileMode ? 'scaleY(1)' : 'scaleY(0.4)' }}
                  />
                </g>

                <g id="right-eye" style={rEyeT ? { ...centerStyle, transform: rEyeT } : undefined}>
                  <g style={{ opacity: eyesHidden ? 0 : 1 }}>
                    <g style={eyeShapeT ? { ...centerStyle, transform: eyeShapeT } : undefined}>
                      <g className="fb-blink-slow" style={centerStyle}>
                        <ellipse id="right-eye-base" cx="551" cy="371" rx="32" ry="39" fill={`url(#${eyeFill})`} />
                        <ellipse id="right-eye-lower-shade" cx="551" cy="393" rx="23" ry="12" fill="var(--jelly-eye-light, #2a1640)" opacity="0.3" />
                        <circle id="right-eye-main-highlight" cx="540" cy="353" r="10.5" fill="#ffffff" opacity={starMode ? 0 : 0.96} />
                        <path
                          id="right-eye-star"
                          d="M540 340 C542.4 349.4 543.6 350.6 553 353 C543.6 355.4 542.4 356.6 540 366 C537.6 356.6 536.4 355.4 527 353 C536.4 350.6 537.6 349.4 540 340 Z"
                          fill="#ffffff"
                          opacity={starMode ? 1 : 0}
                          style={starMode ? { ...centerStyle, transform: 'scale(1)' } : { ...centerStyle, transform: 'scale(0.5)', opacity: 0 }}
                        />
                        <circle id="right-eye-secondary-highlight" cx="545" cy="347" r="3.2" fill="#ffffff" opacity="0.58" />
                        <circle id="right-eye-violet-sparkle" cx="565" cy="391" r="5.8" fill="var(--jelly-eye-sparkle, #b471e6)" opacity="0.62" />
                      </g>
                    </g>
                  </g>
                  <path
                    id="right-eye-happy-arc"
                    d="M523 380 C539 330 563 330 579 380"
                    fill="none"
                    stroke={`url(#${eyeFill})`}
                    strokeWidth="11"
                    strokeLinecap="round"
                    opacity={smileMode ? 1 : 0}
                    style={{ ...centerStyle, transformBox: 'fill-box', transformOrigin: 'center bottom', transform: smileMode ? 'scaleY(1)' : 'scaleY(0.4)' }}
                  />
                </g>
              </g>

              <g id="password-face" pointerEvents="none" style={{ opacity: mood === 'password' ? 1 : 0 }}>
                <path id="left-password-eye" d="M314 353 C331 365 355 365 372 353" fill="none" stroke="#21102f" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
                <path id="right-password-eye" d="M520 353 C537 365 561 365 578 353" fill="none" stroke="#21102f" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" opacity="0.92" />
                <ellipse id="password-dot-mouth" cx="452" cy="397" rx="13" ry="9" fill="#21102f" opacity="0.92" />
              </g>

              <g id="side-eye-eyes" pointerEvents="none" style={{ opacity: mood === 'sideEye' ? 1 : 0, transform: mood === 'sideEye' ? 'translate(-4px 1px)' : undefined }}>
                <path id="left-side-eye" d="M314 357 C331 337 353 336 372 351" fill="none" stroke="#21102f" strokeWidth="11" strokeLinecap="round" opacity="0.92" />
                <ellipse id="left-side-eye-blob" cx="373" cy="360" rx="10.5" ry="13.5" fill="#21102f" opacity="0.92" transform="rotate(-16 373 360)" />
                <path id="right-side-eye" d="M520 357 C537 337 559 336 578 351" fill="none" stroke="#21102f" strokeWidth="11" strokeLinecap="round" opacity="0.92" />
                <ellipse id="right-side-eye-blob" cx="579" cy="360" rx="10.5" ry="13.5" fill="#21102f" opacity="0.92" transform="rotate(-16 579 360)" />
              </g>

              <g id="hmm-lids" pointerEvents="none" style={{ opacity: mood === 'hmm' ? 0.52 : 0, transform: mood === 'hmm' ? 'translate(-2px 2px)' : undefined }}>
                <path id="left-hmm-lid" d="M324 345 C342 336 365 337 383 345" fill="none" stroke="#21102f" strokeWidth="6.5" strokeLinecap="round" opacity="0.62" />
                <path id="right-hmm-lid" d="M521 345 C541 336 564 337 581 345" fill="none" stroke="#21102f" strokeWidth="6.5" strokeLinecap="round" opacity="0.62" />
              </g>

              <g id="sad-brows" pointerEvents="none" style={{ opacity: mood === 'sad' ? 1 : 0 }}>
                <path id="left-sad-brow" d="M318 342 C342 328 370 324 392 331" fill="none" stroke="#21102f" strokeWidth="7" strokeLinecap="round" opacity="0.58" />
                <path id="right-sad-brow" d="M512 331 C534 324 562 328 586 342" fill="none" stroke="#21102f" strokeWidth="7" strokeLinecap="round" opacity="0.58" />
              </g>

              <g id="happy-open-mouth" style={{ opacity: mood === 'happy' ? 1 : 0 }}>
                <path id="open-mouth-fill" d="M420 402 C440 384 465 384 485 402 C470 446 435 446 420 402 Z" fill="#3a0f24" stroke="none" />
                <path id="open-mouth-tongue" d="M438 424 C440 442 465 442 467 424 C462 418 444 418 438 424 Z" fill="var(--jelly-cheek, #ff8fc0)" stroke="none" />
                <ellipse id="open-mouth-tongue-shine" cx="452" cy="427" rx="9" ry="3.4" fill="#ffc2dc" opacity="0.7" />
              </g>

              <path id="mouth" d={mouthD} opacity={mouth || mood === 'password' ? 0 : 1} fill="none" stroke="#21102f" strokeWidth={mood === 'sad' ? 9 : 8} strokeLinecap="round" strokeLinejoin="round" />
              <path id="mouth-oh" d={talkD} fill="#21102f" opacity={mouth ? 1 : 0} />
            </g>
          </g>

          <g id="emotion-fx" style={{ opacity: effectOpacity }} filter={mood === 'happy' || mood === 'sad' || mood === 'angry' ? `url(#${goo})` : undefined}>
            <g id="sad-tears" style={mood === 'sad' ? { animation: 'fb-tear 2.2s ease-in-out infinite' } : { opacity: 0 }}>
              <path d="M335 397 C324 414 326 428 338 434 C351 427 349 413 335 397Z" fill="#9de8ff" opacity="0.82" />
              <ellipse cx="335" cy="410" rx="3.2" ry="5.8" fill="#ffffff" opacity="0.48" transform="rotate(18 335 410)" />
              <path d="M570 397 C559 414 561 428 573 434 C586 427 584 413 570 397Z" fill="#9de8ff" opacity="0.82" />
              <ellipse cx="570" cy="410" rx="3.2" ry="5.8" fill="#ffffff" opacity="0.48" transform="rotate(18 570 410)" />
            </g>

            <g style={mood === 'angry' ? { animation: 'fb-angry-shake 0.32s ease-in-out infinite', opacity: 1 } : { opacity: 0 }}>
              <path d="M617 286 L639 268 M636 292 L660 287 M630 313 L653 329" stroke="var(--jelly-outline, #813ad6)" strokeWidth="9" strokeLinecap="round" opacity="0.86" />
              <circle cx="260" cy="306" r="13" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.55" />
              <circle cx="241" cy="292" r="8" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.45" />
              <circle cx="683" cy="304" r="13" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.55" />
              <circle cx="704" cy="290" r="8" fill="var(--jelly-body-rim, #cf8dff)" opacity="0.45" />
            </g>
          </g>

          <g id="happy-decor" style={{ opacity: mood === 'happy' ? 1 : 0 }}>
            <path id="happy-spark-yellow" d="M636 318 C638 332 642 336 656 338 C642 340 638 344 636 358 C634 344 630 340 616 338 C630 336 634 332 636 318 Z" fill="#ffe07a" style={{ ...centerStyle, animation: 'fb-float-spark 1.6s ease-in-out infinite' }} />
            <circle id="happy-spark-yellow-dot" cx="662" cy="318" r="4" fill="#fff2a8" />
            <path id="happy-heart-pink" d="M270 326 C264 318 252 320 252 331 C252 341 263 348 270 354 C277 348 288 341 288 331 C288 320 276 318 270 326 Z" fill="var(--jelly-cheek, #ff8fc6)" style={{ ...centerStyle, animation: 'fb-float-heart 1.8s ease-in-out 0.3s infinite' }} />
            <circle id="happy-heart-dot" cx="263" cy="328" r="2.6" fill="#ffd0e6" opacity="0.85" />
          </g>
        </g>
      </g>
    </svg>
  )
}

const DEFAULT_SPEECH: Record<JellyBlobMood, string> = {
  sideEye: '…seriously?',
  hmm: 'Hmm… really?',
  password: 'Secret safe.',
  neutral: 'Going somewhere?',
  happy: 'Yay, stay with me!',
  sad: 'Aww, don’t go…',
  angry: 'Hmph. Rude!',
}

export interface BlobSpeechProps {
  mood?: JellyBlobMood
  messages?: Partial<Record<JellyBlobMood, string>>
  className?: string
}

const BUBBLE_R = 12
const BUBBLE_PAD_X = 14
const BUBBLE_PAD_Y = 7
const BUBBLE_LINE = 14
const MIN_W = 120
const MAX_W = 240

// Variable-height bubble: body height grows with the number of wrapped lines so
// longer messages fit instead of overflowing the fixed single-line cloud.
function bubblePath(w: number, bodyH: number): string {
  const r = BUBBLE_R
  const cx = w / 2
  return `M${r} 1 H${w - r} A${r} ${r} 0 0 1 ${w - 1} ${r} V${bodyH - r} A${r} ${r} 0 0 1 ${w - r} ${bodyH} H${cx + 11} L${cx + 3} ${bodyH + 11} Q${cx} ${bodyH + 13} ${cx - 3} ${bodyH + 11} L${cx - 11} ${bodyH} H${r} A${r} ${r} 0 0 1 1 ${r} V${bodyH - r} A${r} ${r} 0 0 1 ${r} 1 Z`
}

const BUBBLE_POSE: Record<JellyBlobMood, CSSProperties | undefined> = {
  neutral: { animation: 'fb-bubble-bob 3.6s ease-in-out 0.55s infinite' },
  happy: { animation: 'fb-bubble-hop 1.1s cubic-bezier(0.34, 1.56, 0.64, 1) infinite' },
  sad: { transform: 'translateY(6px)' },
  angry: { animation: 'fb-bubble-angry 0.42s ease-in-out infinite' },
  hmm: { transform: 'rotate(4deg)' },
  sideEye: { transform: 'rotate(4deg)' },
  password: { animation: 'fb-bubble-bob 3.8s ease-in-out infinite' },
}

export function BlobSpeech({ mood = 'neutral', messages, className }: BlobSpeechProps) {
  const uid = useId().replace(/:/g, '')
  const clipId = `${uid}-bubbleClip`
  const sheenId = `${uid}-bubbleSheen`
  const fillId = `${uid}-bubbleFill`
  const strokeId = `${uid}-bubbleStroke`
  const text = messages?.[mood] ?? DEFAULT_SPEECH[mood]

  const measureRef = useRef<HTMLSpanElement>(null)
  const [w, setW] = useState(180)
  const [bodyH, setBodyH] = useState(44)
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) return
    el.style.whiteSpace = 'nowrap'
    el.textContent = text
    const natW = el.getBoundingClientRect().width
    const visualW = Math.round(Math.min(MAX_W, Math.max(MIN_W, natW + BUBBLE_PAD_X * 2)))
    const wrapW = Math.max(80, visualW - BUBBLE_PAD_X * 2)
    let lines = 1
    if (natW > wrapW) {
      const words = text.split(' ')
      const wrapped: string[] = []
      let line = ''
      for (const word of words) {
        const test = line ? `${line} ${word}` : word
        el.textContent = test
        if (el.getBoundingClientRect().width > wrapW && line) {
          wrapped.push(line)
          line = word
        } else {
          line = test
        }
      }
      if (line) wrapped.push(line)
      lines = Math.max(1, wrapped.length)
    }
    const h = Math.round(BUBBLE_PAD_Y * 2 + lines * BUBBLE_LINE)
    setW(visualW)
    setBodyH(Math.max(2 * BUBBLE_R, h))
  }, [text])

  const d = bubblePath(w, bodyH)
  const bubbleH = bodyH + 14
  const pose = BUBBLE_POSE[mood]

  return (
    <div
      className={['blob-bubble fb-bubble', className].filter(Boolean).join(' ')}
      data-mood={mood}
      aria-hidden="true"
      style={{ width: w, height: bubbleH, transformOrigin: 'bottom center', ...pose }}
    >
      <span ref={measureRef} className="blob-bubble-measure" aria-hidden="true">
        {text}
      </span>

      <svg className="blob-bubble-shape" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={clipId}>
            <path d={d} />
          </clipPath>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bubble-fill-top)" />
            <stop offset="1" stopColor="var(--bubble-fill-bottom)" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--bubble-stroke-top)" />
            <stop offset="0.6" stopColor="var(--bubble-stroke-bottom)" />
            <stop offset="1" stopColor="var(--bubble-stroke-bottom)" />
          </linearGradient>
          <linearGradient id={sheenId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.18" />
            <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.04" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <path className="blob-bubble-fill" d={d} fill={`url(#${fillId})`} stroke="none" />
        <g clipPath={`url(#${clipId})`}>
           <rect x="0" y="0" width={w} height={bubbleH} fill={`url(#${sheenId})`} />
        </g>
        <path className="blob-bubble-stroke" d={d} fill="none" stroke={`url(#${strokeId})`} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>

      <div className="blob-bubble-textwrap" style={{ height: bodyH, paddingLeft: BUBBLE_PAD_X, paddingRight: BUBBLE_PAD_X }}>
        <p key={`${mood}-${text}`} className="blob-bubble-text" style={{ width: w - BUBBLE_PAD_X * 2 }}>
          {text.split(' ').map((word, i, arr) => (
            <span
              key={i}
              style={{ display: 'inline-block', whiteSpace: 'pre', animation: `fb-word 0.34s cubic-bezier(0.22, 1, 0.36, 1) ${0.05 + i * 0.08}s both` }}
            >
              {i < arr.length - 1 ? word + ' ' : word}
            </span>
          ))}
        </p>
      </div>
    </div>
  )
}