// Web Audio API loud alarm & timer warning cues (zero external MP3 dependencies)

class ExamAudioController {
  private ctx: AudioContext | null = null;
  private alarmInterval: number | null = null;
  private isAlarmActive = false;

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public unlock() {
    this.ensureContext();
  }

  public playGentleWarningChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [587.33, 880];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + idx * 0.16);
      gain.gain.setValueAtTime(0.001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.25, now + idx * 0.16 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.36);
    });
  }

  public startLoudAlarm() {
    if (this.isAlarmActive) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.isAlarmActive = true;

    const triggerSirenPulse = () => {
      if (!this.isAlarmActive || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.linearRampToValueAtTime(1320, now + 0.22);
      osc.frequency.linearRampToValueAtTime(880, now + 0.44);

      gain.gain.setValueAtTime(0.75, now);
      gain.gain.setValueAtTime(0.75, now + 0.4);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.48);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    };

    triggerSirenPulse();
    this.alarmInterval = window.setInterval(triggerSirenPulse, 520);
  }

  public stopAlarm() {
    this.isAlarmActive = false;
    if (this.alarmInterval !== null) {
      window.clearInterval(this.alarmInterval);
      this.alarmInterval = null;
    }
  }
}

export const examAudio = new ExamAudioController();
