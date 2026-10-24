import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInput } from '@core/input';

function fixture() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { pointerLockElement: null as HTMLCanvasElement | null, exitPointerLock: vi.fn() });
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 1000, height: 600 }),
    setPointerCapture: vi.fn(), requestPointerLock: vi.fn(() => Promise.resolve()),
  });
  class Element extends EventTarget { isContentEditable = false; }
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', { userActivation: { isActive: false } });
  vi.stubGlobal('HTMLElement', Element);
  vi.stubGlobal('HTMLInputElement', class extends Element {});
  vi.stubGlobal('HTMLTextAreaElement', class extends Element {});
  const input = createInput(canvas as unknown as HTMLCanvasElement, new THREE.PerspectiveCamera(), 0.9);
  const event = (target: EventTarget, type: string, values: Record<string, unknown> = {}) => {
    const e = Object.assign(new Event(type, { cancelable: true }), values);
    target.dispatchEvent(e);
    return e;
  };
  const pointer = (type: string, values: Record<string, unknown> = {}) => event(canvas, type, {
    pointerId: 1, button: 0, clientX: 90, clientY: 50, movementX: 0, movementY: 0, ...values,
  });
  const lock = (on: boolean) => {
    doc.pointerLockElement = on ? canvas as unknown as HTMLCanvasElement : null;
    event(doc, 'pointerlockchange');
  };
  return { input, win, doc, canvas, event, pointer, lock };
}

afterEach(() => vi.unstubAllGlobals());

describe('mouse-look input', () => {
  it('uses the first click to lock, then turns on motion without any button held', () => {
    const f = fixture();
    const look = vi.fn();
    const game = vi.fn();
    f.input.onLook(look);
    f.input.onPointer(game);
    f.input.setLookEnabled(true);
    f.pointer('pointerdown');
    expect(f.canvas.requestPointerLock).toHaveBeenCalledOnce();
    expect(game).not.toHaveBeenCalled();
    f.lock(true);
    f.pointer('pointermove', { movementX: 25, movementY: -10 });
    expect(look).toHaveBeenCalledWith(25, -10);
    expect(f.input.pointer.down).toBe(false);
    expect(f.input.ndc.toArray()).toEqual([0, 0]);
    expect(f.input.pointer).toMatchObject({ x: 510, y: 320 });
  });

  it('preserves primary-button cooking and wheel input while looking', () => {
    const f = fixture();
    const game = vi.fn();
    const wheel = vi.fn();
    f.input.onPointer(game);
    f.input.onWheel(wheel);
    f.input.setLookEnabled(true);
    f.lock(true);
    f.pointer('pointerdown', { button: 2 });
    expect(game).not.toHaveBeenCalled();
    f.pointer('pointerdown');
    expect(f.input.pointer.down).toBe(true);
    expect(game.mock.calls[0]![0]).toBe('down');
    f.pointer('pointerup');
    expect(game.mock.calls[1]![0]).toBe('up');
    f.event(f.canvas, 'wheel', { deltaY: 30 });
    expect(wheel.mock.calls[0]![0]).toBe(30);
  });

  it('cancels held input on Esc/lock loss and resumes only after a new capture', () => {
    const f = fixture();
    const game = vi.fn();
    const look = vi.fn();
    f.input.onPointer(game);
    f.input.onLook(look);
    f.input.setLookEnabled(true);
    f.lock(true);
    f.event(f.win, 'keydown', { code: 'KeyW', repeat: false });
    f.pointer('pointerdown');
    f.lock(false);
    expect(f.input.keys.size).toBe(0);
    expect(f.input.pointer.down).toBe(false);
    expect(game.mock.calls.map(([kind]) => kind)).toEqual(['down', 'up']);
    f.pointer('pointermove', { movementX: 20 });
    expect(look).not.toHaveBeenCalled();
    f.pointer('pointerdown');
    expect(f.canvas.requestPointerLock).toHaveBeenCalledOnce();
  });

  it('clears keys and releases a drag on window blur; normal pointer mode still works', () => {
    const f = fixture();
    const game = vi.fn();
    f.input.onPointer(game);
    f.event(f.win, 'keydown', { code: 'KeyW', repeat: false });
    f.pointer('pointerdown');
    expect(f.input.ndc.x).not.toBe(0);
    f.event(f.win, 'blur');
    expect(f.input.keys.size).toBe(0);
    expect(f.input.pointer.down).toBe(false);
    expect(game.mock.calls.map(([kind]) => kind)).toEqual(['down', 'up']);
  });

  it('releases the browser lock when leaving first-person', () => {
    const f = fixture();
    f.input.setLookEnabled(true);
    f.lock(true);
    f.input.setLookEnabled(false);
    expect(f.doc.exitPointerLock).toHaveBeenCalledOnce();
    expect(f.input.lookActive).toBe(false);
  });

  it('explicitly releases capture on Escape even if the browser does not handle it', () => {
    const f = fixture();
    f.input.setLookEnabled(true);
    f.lock(true);
    f.event(f.win, 'keydown', { code: 'Escape', repeat: false });
    expect(f.doc.exitPointerLock).toHaveBeenCalledOnce();
  });
});
