import { FulfillmentIntelligenceDashboard } from '../components/FulfillmentIntelligenceDashboard';

export interface FulfillmentIntelligencePageProps {
  tenantId: string;
  productId: string;
}

export const FulfillmentIntelligencePage = ({ tenantId, productId }: FulfillmentIntelligencePageProps) => (
  <main style={{ padding: '20px' }}>
    <h1>Fulfillment Intelligence</h1>
    <FulfillmentIntelligenceDashboard tenantId={tenantId} productId={productId} />
  </main>
);
