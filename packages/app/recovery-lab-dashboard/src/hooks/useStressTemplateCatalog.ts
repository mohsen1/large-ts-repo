import { useEffect, useMemo, useState } from 'react';

import {
  stressTemplateWorkflows,
  stressTypeLabs,
} from '@shared/type-level';

type TemplateRow = {
  readonly action: string;
  readonly domain: string;
  readonly severity: string;
  readonly id: string;
  readonly raw: string;
  readonly route: string;
  readonly signature: string;
};

type ViewModel = {
  readonly loaded: boolean;
  readonly catalog: readonly TemplateRow[];
  readonly sections: readonly string[];
  readonly total: number;
  readonly intersectionSample: Readonly<Record<string, unknown>>;
};

const baseTemplates = stressTypeLabs.stressCatalogTemplate;

const bootstrapCatalog = async (): Promise<readonly string[]> => {
  await Promise.resolve();
  return baseTemplates.map((entry, index) => {
    const parts = entry.split(':');
    return `${parts[0]}:${parts[1]}:${parts[2]}:${index + 100}`;
  });
};

const routeDisposer = () => {
  return undefined;
};

export const useStressTemplateCatalog = (): ViewModel => {
  const [templates, setTemplates] = useState<readonly string[]>(() => []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const stack = new AsyncDisposableStack();
    stack.defer(routeDisposer);

    (async () => {
      const resolved = await bootstrapCatalog();
      if (mounted) {
        setTemplates(resolved);
      }
      setLoading(false);
    })();

    return () => {
      mounted = false;
      void stack.disposeAsync();
    };
  }, []);

  const parsed = useMemo(() => {
    const list = templates.length > 0 ? templates : baseTemplates;
    const catalog = list.map((entry) => {
      const parsedValue = stressTemplateWorkflows.parseRouteCatalog(entry);
      return {
        action: parsedValue.action,
        domain: parsedValue.entity,
        severity: parsedValue.severity,
        id: parsedValue.id,
        raw: entry,
        route: `/${parsedValue.action}/${parsedValue.entity}/${parsedValue.severity}/${parsedValue.id}`,
        signature: `${parsedValue.action}:${parsedValue.entity}:${parsedValue.severity}:${parsedValue.id}`,
      };
    });

  return {
      sections: Object.keys(stressTemplateWorkflows.routeEntities),
      total: catalog.length,
      catalog,
      loaded: !loading,
      intersectionSample: {},
    };
  }, [templates, loading]);

  return {
    catalog: parsed.catalog,
    sections: parsed.sections,
    total: parsed.total,
    loaded: parsed.loaded,
    intersectionSample: parsed.intersectionSample,
  };
};
