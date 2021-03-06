import { cloneDeep, forEach, reduce, sumBy } from 'lodash-es';
import { Application, Texture } from 'pixi.js';
import Judger from './judger';
import UiRenderer from './ui-renderer';
import AudioPlayer, { VolumeOptions } from './audio-player';
import JudgeLineRenderer from './judge-line-renderer';
import type { ChartData } from '../shared/chart-data';
import type { ResourceName, Skin } from './skin';
import { load } from './utils';
import { calcTick } from '../shared/tick';

export type Textures = {
  [k in ResourceName]: Texture;
};

export interface PreviewOptions {
  title: string;
  diff: string;
  background: string;
  music: string;
}

export interface PlayerOptions {
  canvas: HTMLCanvasElement;
  chart: ChartData;
  skin: Skin;
  preview: PreviewOptions;
  rate: number;
  volume: VolumeOptions;
  width?: number;
  height?: number;
  time?: number;
}

const emptyState = (): void => { /** */ };

export default class Player {
  app: Application;
  state: () => void = emptyState;

  chart: ChartData;
  width: number;
  height: number;

  skin: Skin;
  textures!: Textures;
  judger!: Judger;
  uiRenderer: UiRenderer;
  audioPlayer: AudioPlayer;
  judgeLines: JudgeLineRenderer[] = [];

  rate: number;
  bpm: number;
  tick: number;
  comboTotal: number;
  combo = 0;
  timeMap: Record<number, number> = {};

  constructor(options: PlayerOptions, ready?: () => void) {
    this.chart = cloneDeep(options.chart);
    this.skin = options.skin;
    this.width = options.width ?? 1280;
    this.height = options.height ?? 720;
    this.rate = options.rate;
    this.tick = calcTick(this.chart.timing, options.time ?? 0) - this.chart.timing.offset;
    this.bpm = this.chart.timing.bpmList[0].bpm;
    this.chart.timing.bpmList.shift();
    this.comboTotal = sumBy(this.chart.judgeLineList, l => l.noteList.filter(n => !n.isFake).length);
    this.app = new Application({
      width: this.width,
      height: this.height,
      view: options.canvas,
      antialias: true,
    });
    this.uiRenderer = new UiRenderer(this);
    this.audioPlayer = new AudioPlayer(this.skin.fx, options.rate, options.volume);

    forEach(this.skin.resources, url => {
      this.app.loader.add(url);
    });

    load(this.app.loader).then(async () => {
      await this.setup();
      await this.uiRenderer.setup(options.preview);
      this.audioPlayer.init(options.preview.music, options.time);
      ready?.();
      return;
    }).catch(() => { /** */ });
  }

  async setup(): Promise<void> {
    this.textures = reduce(this.skin.resources, (result, url, name) => {
      const t = this.app.loader.resources[url].texture;
      t.baseTexture.setResolution(1 / this.skin.noteRatio);
      result[<ResourceName>name] = t;
      return result;
    }, <Textures>{});

    this.chart.judgeLineList.forEach(l => {
      l.noteList.forEach(n => {
        const time = n.type === 'hold' ? n.startTime : n.endTime;
        this.timeMap[time] = this.timeMap[time] ?? 0;
        ++this.timeMap[time];
      });
    });

    this.judger = new Judger(this);

    this.judgeLines.push(...this.chart.judgeLineList.map(l => new JudgeLineRenderer(this, l)));

    this.app.ticker.add(() => this.gameLoop());
  }

  destroy(): void {
    this.app.destroy(false, {
      children: true,
    });
    this.audioPlayer.destroy();
  }

  pause(paused: boolean): void {
    if (paused) {
      this.state = emptyState;
    } else {
      this.state = this.play;
    }

    this.audioPlayer.pause(paused);
  }

  gameLoop(): void {
    this.state();
  }

  play(): void {
    const dt = this.app.ticker.elapsedMS / 1000;
    while (this.chart.timing.bpmList.length > 0) {
      const b = this.chart.timing.bpmList[0];
      if (b.time > this.tick) {
        break;
      } else {
        this.bpm = b.bpm;
        this.chart.timing.bpmList.shift();
      }
    }

    this.tick += this.bpm * dt * 1.2 * this.rate;
    console.log(this.tick, this.audioPlayer.music?.seek());

    this.judgeLines = this.judgeLines.filter(l => {
      l.update();
      if (this.tick > l.constructEvent.endTime) {
        this.app.stage.removeChild(l.container);
        return false;
      }

      return true;
    });

    this.uiRenderer.update();
  }

  resize(width: number, height: number): void {
    const scale = Math.min(width / this.width, height / this.height);
    this.app.renderer.resize(this.width * scale, this.height * scale);
    this.app.stage.scale.set(scale, scale);
  }

  calcX(x: number): number {
    return (x + 1) * this.width / 2;
  }

  calcY(y: number): number {
    return (1 - y) * this.height / 2;
  }
}
