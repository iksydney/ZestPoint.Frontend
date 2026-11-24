import { BarOrderDto, StationScreen } from './models/ops.model';

/** The words for the two screens a station's tickets can be worked on (owner's decision, 2026-11-24: each station picks its screen). */
export const STATION_SCREEN_LABEL: Readonly<Record<StationScreen, string>> = { BarOrders: 'Bar Orders', KitchenDisplay: 'Kitchen Display' };

/**
 * The screen a new station is offered, worked out the way the server works it out when the choice is left out: a station that holds payment
 * or takes stock when it is ready is a bar, so Bar Orders; any other is a kitchen, so Kitchen Display. The person may change it.
 */
export function defaultStationScreen(holdsPayment: boolean, stockWhenReady: boolean): StationScreen {
  return holdsPayment || stockWhenReady ? 'BarOrders' : 'KitchenDisplay';
}

/**
 * Whether a ticket belongs on the Bar Orders side (the screen, the floating panel, the bell and its sound). The server already sends only
 * those (`screen=bar`); this is the second look for a ticket whose station says otherwise. A ticket from before stations says nothing and stays,
 * because the server chose to send it.
 */
export const onBarScreen = (o: BarOrderDto): boolean => o.stationScreen !== 'KitchenDisplay';

/** The same for the Kitchen Display. */
export const onKitchenScreen = (o: BarOrderDto): boolean => o.stationScreen !== 'BarOrders';
