import { App, reactive } from 'vue';
import type { ChartData } from './player/ChartData';
import chart from './chart.json';

const store = {
  state: reactive({
    chart: <ChartData>(localStorage.chart ? JSON.parse(localStorage.chart) : chart),
    offset: localStorage.offset ? Number.parseFloat(localStorage.offset) : 0,
    activePage: localStorage.activePage ? localStorage.activePage : 'note',
  }),

  setChart(newChart: ChartData) {
    this.state.chart = newChart;
    localStorage.chart = JSON.stringify(newChart);
  },

  setOffset(newOffset: number) {
    this.state.offset = newOffset;
    localStorage.offset = newOffset.toString();
  },

  setActivePage(newActivePage: 'note' | 'event') {
    this.state.activePage = newActivePage;
    localStorage.activePage = newActivePage;
  },
};

declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $store: typeof store;
  }
}

export default function install(app: App): void {
  app.config.globalProperties.$store = store;
}
