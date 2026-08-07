import { cloneAudioBuffer } from "../audio/BufferEdit.js";

/**
 * Undo/redo stack of AudioBuffer snapshots.
 * push() stores a clone of the current buffer before an edit is applied.
 */
export class EditHistory {
  private undoStack: AudioBuffer[] = [];
  private redoStack: AudioBuffer[] = [];

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly maxDepth = 20,
  ) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Save state before applying an edit. Clears redo. */
  push(current: AudioBuffer): void {
    this.undoStack.push(cloneAudioBuffer(this.ctx, current));
    while (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  /**
   * Undo: push current onto redo, return previous snapshot.
   * Caller replaces transport buffer with the returned value.
   */
  undo(current: AudioBuffer): AudioBuffer | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(cloneAudioBuffer(this.ctx, current));
    return prev;
  }

  redo(current: AudioBuffer): AudioBuffer | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneAudioBuffer(this.ctx, current));
    return next;
  }
}
