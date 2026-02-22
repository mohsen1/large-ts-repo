import { StockCell } from './stock';

export interface Reservation {
  orderId: string;
  sku: string;
  qty: number;
  expiresAt: string;
}

export interface ReservationMap {
  [reservationId: string]: Reservation;
}

export const addReservation = (reservations: ReservationMap, id: string, value: Reservation): ReservationMap => {
  return { ...reservations, [id]: value };
};

export const expireReservations = (reservations: ReservationMap, now: number): ReservationMap => {
  const out: ReservationMap = {};
  for (const [id, reservation] of Object.entries(reservations)) {
    if (Date.parse(reservation.expiresAt) > now) out[id] = reservation;
  }
  return out;
};

export const findBySku = (reservations: ReservationMap, sku: string): Reservation[] =>
  Object.values(reservations).filter((reservation) => reservation.sku === sku);

export const totalReservedFor = (cell: StockCell, reservations: ReservationMap): number =>
  findBySku(reservations, cell.sku).reduce((sum, item) => sum + item.qty, 0);
