// Match Python round (nearest, ties-to-even) used by the audio backend.
function roundEven(value) {
    const floor = Math.floor(value), fraction = value - floor;
    return fraction === .5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(value);
}
export function range(total, duration, start, sr = 48000) {
    if (!(total > 0) || !(duration > 0) || !Number.isFinite(start)) return null;
    const count = Math.max(1, roundEven(duration * sr));
    const samples = Math.round(total * sr);
    if (count > samples) return null;
    const first = Math.min(Math.max(0, roundEven(start * sr)), samples - count);
    return {start: first / sr, end: (first + count) / sr, duration: count / sr};
}

export function connectedDuration(node) {
    const input = node.inputs?.find(i => i.name === 'duration');
    const link = input?.link != null ? node.graph?.links?.[input.link] : null;
    if (!link) return null;
    const source = node.graph?.getNodeById(link.origin_id);
    if (!source) return null;
    const output = source.outputs?.[link.origin_slot]?.name;
    if (source.comfyClass === 'H3VideoController' && output === 'actual_duration_seconds') {
        const seconds = Number(source.widgets?.find(w => w.name === 'duration_seconds')?.value);
        if (seconds > 0) return (Math.max(0, Math.ceil((seconds * 24 - 5) / 17 - 1e-10)) * 17 + 5) / 24;
    }
    const value = source.getOutputData?.(link.origin_slot);
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
