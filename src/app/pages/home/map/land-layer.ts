import * as Leaflet from 'leaflet';
import { GRID_ZOOM, TILE_PIXEL_SIZE } from 'src/app/core/grid';
import { LandTile } from 'src/app/providers/land.service';

export interface LandLayerHost {
  tileAt(gx: number, gy: number): LandTile | undefined;
  isMine(tile: LandTile): boolean;
  isSelectedNew(gx: number, gy: number): boolean;
  isSelectedOwned(gx: number, gy: number): boolean;
  /** buyGrid: draw outlines on free squares; scan: outline every owned area. */
  mode(): { buyGrid: boolean; scan: boolean; showGridOnImages: boolean };
}

const COLORS = {
  mine: '#10b981',
  other: '#f43f5e',
  sale: '#f59e0b',
  official: '#38bdf8',
  selected: '#38bdf8',
  selectedOwned: '#fbbf24',
};

/**
 * Canvas layer that paints owned land at the buy zoom. Squares with artwork are
 * drawn edge to edge (no gaps, no borders) so neighbouring images join up; an
 * image can span several squares via `span_bounds`.
 */
export class LandLayer {
  readonly layer: Leaflet.GridLayer;
  private images = new Map<string, HTMLImageElement>();
  private failed = new Set<string>();
  private sheets = new Map<string, { canvas: HTMLCanvasElement; sx: number; sy: number }>();

  constructor(private host: LandLayerHost) {
    const self = this;
    const Layer = Leaflet.GridLayer.extend({
      createTile(coords: Leaflet.Coords, done: Leaflet.DoneCallback) {
        const canvas = Leaflet.DomUtil.create('canvas', 'leaflet-tile flatmeta-land-tile') as HTMLCanvasElement;
        const size = (this as any).getTileSize();
        canvas.width = size.x;
        canvas.height = size.y;
        self.paint(canvas, coords);
        setTimeout(() => done(undefined, canvas), 0);
        return canvas;
      },
    });
    this.layer = new (Layer as any)({
      tileSize: TILE_PIXEL_SIZE,
      minZoom: GRID_ZOOM,
      maxZoom: GRID_ZOOM,
      updateWhenZooming: false,
      pane: 'fmLand',
    });
  }

  redraw() {
    this.layer.redraw();
  }

  setOpacity(value: number) {
    this.layer.setOpacity(value);
  }

  private paint(canvas: HTMLCanvasElement, coords: Leaflet.Coords) {
    const ctx = canvas.getContext('2d');
    if (!ctx || coords.z !== GRID_ZOOM) return;
    const w = canvas.width;
    const h = canvas.height;
    const { gx, gy } = { gx: coords.x, gy: coords.y };
    const mode = this.host.mode();
    const tile = this.host.tileAt(gx, gy);

    if (!tile) {
      if (this.host.isSelectedNew(gx, gy)) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.32)';
        ctx.fillRect(0, 0, w, h);
        this.outline(ctx, COLORS.selected, 1.6, w, h);
      } else if (mode.buyGrid) {
        // Thin, faint lines so the map stays readable while choosing squares.
        this.outline(ctx, 'rgba(100, 116, 139, 0.38)', 0.5, w, h);
      }
      return;
    }

    const mine = this.host.isMine(tile);
    const selected = this.host.isSelectedOwned(gx, gy);
    const edge = tile.official ? COLORS.official : mine ? COLORS.mine : tile.on_sale ? COLORS.sale : COLORS.other;
    const overlay = () => {
      if (selected) {
        this.outline(ctx, COLORS.selectedOwned, 2.2, w, h);
      } else if (mode.scan) {
        this.outline(ctx, edge, 1.5, w, h);
      } else if (!tile.image || mode.showGridOnImages) {
        this.outline(ctx, edge, 0.8, w, h);
      }
      if (tile.draft) {
        ctx.setLineDash([3, 3]);
        this.outline(ctx, COLORS.mine, 1, w, h);
        ctx.setLineDash([]);
      }
    };

    if (!tile.image) {
      ctx.fillStyle = mine ? 'rgba(16, 185, 129, 0.22)' : 'rgba(244, 63, 94, 0.16)';
      ctx.fillRect(0, 0, w, h);
      overlay();
      return;
    }

    this.withImage(tile.image, (img) => {
      ctx.clearRect(0, 0, w, h);
      const b = tile.span_bounds;
      if (b && gx >= b.minGx && gx <= b.maxGx && gy >= b.minGy && gy <= b.maxGy) {
        const cols = b.maxGx - b.minGx + 1;
        const rows = b.maxGy - b.minGy + 1;
        // Cut this square's piece out of the whole picture scaled to the area.
        const { canvas: sheet, sx, sy } = this.sheet(tile.image, img, cols * w, rows * h);
        ctx.drawImage(sheet, (gx - b.minGx) * w * sx, (gy - b.minGy) * h * sy, w * sx, h * sy, 0, 0, w, h);
      } else {
        ctx.drawImage(img, 0, 0, w, h);
      }
      overlay();
    }, () => {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.fillRect(0, 0, w, h);
      overlay();
    });
  }

  /**
   * The picture drawn at the size of a whole multi-square area (capped for
   * canvas limits). SVGs without an intrinsic size report 0x0, so we always
   * scale into a canvas of known size rather than slicing the source image.
   */
  private sheet(src: string, img: HTMLImageElement, width: number, height: number) {
    const key = `${src}|${width}x${height}`;
    let entry = this.sheets.get(key);
    if (!entry) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(width, 4096);
      canvas.height = Math.min(height, 4096);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      entry = { canvas, sx: canvas.width / width, sy: canvas.height / height };
      this.sheets.set(key, entry);
      if (this.sheets.size > 60) this.sheets.delete(this.sheets.keys().next().value);
    }
    return entry;
  }

  private outline(ctx: CanvasRenderingContext2D, color: string, width: number, w: number, h: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(width / 2, width / 2, w - width, h - width);
  }

  private withImage(src: string, draw: (img: HTMLImageElement) => void, onError: () => void) {
    if (this.failed.has(src)) {
      onError();
      return;
    }
    const cached = this.images.get(src);
    if (cached?.complete && cached.naturalWidth > 0) {
      draw(cached);
      return;
    }
    const img = cached || new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => draw(img), { once: true });
    img.addEventListener('error', () => {
      this.failed.add(src);
      onError();
    }, { once: true });
    if (!cached) {
      this.images.set(src, img);
      img.src = src;
    }
  }
}
