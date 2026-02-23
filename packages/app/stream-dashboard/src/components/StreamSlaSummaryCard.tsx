import { ThroughputForecast } from '@domain/streaming-observability';

export interface StreamSlaSummaryCardProps {
  streamId: string;
  forecast: ThroughputForecast;
  onScaleRequest: (streamId: string, expectedParallelism: number) => void;
}

export function StreamSlaSummaryCard({ streamId, forecast, onScaleRequest }: StreamSlaSummaryCardProps) {
  const quality = forecast.confidence >= 0.85 ? 'high confidence' : forecast.confidence >= 0.6 ? 'medium confidence' : 'low confidence';
  return (
    <section>
      <h3>SLA Forecast {streamId}</h3>
      <p>Window end: {new Date(forecast.windowEnd).toLocaleTimeString()}</p>
      <p>Predicted EPS: {forecast.predictedEventsPerSecond}</p>
      <p>Confidence: {forecast.confidence} ({quality})</p>
      <p>Recommended parallelism: {forecast.recommendedParallelism}</p>
      <button type="button" onClick={() => onScaleRequest(streamId, forecast.recommendedParallelism)}>
        Apply parallelism
      </button>
    </section>
  );
}
