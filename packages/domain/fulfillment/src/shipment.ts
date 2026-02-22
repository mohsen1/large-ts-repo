export interface Shipment {
  id: string;
  orderId: string;
  carrier: string;
  status: 'created' | 'dispatched' | 'in_transit' | 'delivered' | 'lost';
  events: readonly ShipmentEvent[];
}

export interface ShipmentEvent {
  at: string;
  type: 'created' | 'picked' | 'packed' | 'label' | 'delivered';
  note?: string;
}

export const addEvent = (shipment: Shipment, event: Omit<ShipmentEvent, 'at'>): Shipment => ({
  ...shipment,
  events: [...shipment.events, { ...event, at: new Date().toISOString() }],
  status: inferStatus(event.type),
});

const inferStatus = (eventType: ShipmentEvent['type']): Shipment['status'] => {
  switch (eventType) {
    case 'created':
      return 'created';
    case 'picked':
    case 'packed':
    case 'label':
      return 'dispatched';
    case 'delivered':
      return 'delivered';
    default:
      return 'in_transit';
  }
};

export const isComplete = (shipment: Shipment): boolean => shipment.status === 'delivered';
