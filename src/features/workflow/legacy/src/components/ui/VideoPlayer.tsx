import type { StepVideo } from '@/lib/types'

interface VideoPlayerProps {
    video: StepVideo
    compact?: boolean
    onWatched?: () => void
}

export default function VideoPlayer({ video, compact = false }: VideoPlayerProps) {
    return (
        <div className={`border border-border bg-white ${compact ? 'mb-3 px-3 py-3' : 'mb-7'}`}>
            {!compact && (
                <div className="flex aspect-video items-center justify-center bg-[#102b34] px-5 text-center text-white/80">
                    <div>
                        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-white/40 text-xl" aria-hidden="true">▷</div>
                        <div className="font-sans text-sm font-semibold">Video not connected</div>
                        <div className="mt-1 font-sans text-xs text-white/60">A media source must be approved and linked before playback is available.</div>
                    </div>
                </div>
            )}
            <div className={compact ? '' : 'px-4 py-3'}>
                <div className="font-sans text-sm font-semibold text-ink">{video.title}</div>
                <div className="mt-1 font-mono text-[10px] text-ink3">{video.id}{video.trnCode ? ` · ${video.trnCode}` : ''} · Listed duration {video.duration}</div>
                {compact && <div className="mt-1 font-sans text-xs text-ink3">Video not connected</div>}
            </div>
        </div>
    )
}
