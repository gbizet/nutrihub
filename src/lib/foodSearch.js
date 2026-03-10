const OFF_ENDPOINTS = [
  {
    name: 'OFF World CGI',
    buildUrl: (q, pageSize) =>
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${pageSize}`,
  },
  {
    name: 'OFF France CGI',
    buildUrl: (q, pageSize) =>
      `https://fr.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${pageSize}`,
  },
  {
    name: 'OFF World V2',
    buildUrl: (q, pageSize) =>
      `https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(q)}&page_size=${pageSize}&fields=code,product_name,brands,nutriments`,
  },
  {
    name: 'OFF World V2 .net',
    buildUrl: (q, pageSize) =>
      `https://world.openfoodfacts.net/api/v2/search?search_terms=${encodeURIComponent(q)}&page_size=${pageSize}&fields=code,product_name,product_name_fr,brands,nutriments`,
  },
  {
    name: 'OFF Product Search .net',
    buildUrl: (q, pageSize) =>
      `https://world.openfoodfacts.net/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${pageSize}`,
  },
];

const mapProducts = (products = []) =>
  products
    .filter((p) => p.product_name || p.product_name_fr || p.name)
    .map((p) => ({
      id: p.code || p.id || p._id || `${p.product_name}-${p.brands || ''}`,
      name: p.product_name || p.product_name_fr || p.name,
      brand: p.brands || '',
      kcal: p.nutriments?.['energy-kcal_100g'] || p.nutriments?.energy_kcal_100g || p.nutriments?.['energy-kcal'] || 0,
      protein: p.nutriments?.proteins_100g || 0,
      carbs: p.nutriments?.carbohydrates_100g || 0,
      fat: p.nutriments?.fat_100g || 0,
      source: 'openfoodfacts',
    }));

const fetchWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
};

export async function searchFoodWeb(query, { pageSize = 10, timeoutMs = 7000 } = {}) {
  const diagnostics = [];

  for (const endpoint of OFF_ENDPOINTS) {
    const url = endpoint.buildUrl(query, pageSize);
    try {
      const response = await fetchWithTimeout(url, timeoutMs);
      const status = response.status;
      if (!response.ok) {
        diagnostics.push({ endpoint: endpoint.name, url, ok: false, status, error: `HTTP ${status}`, count: 0 });
        continue;
      }

      const payload = await response.json();
      const products = Array.isArray(payload.products)
        ? payload.products
        : Array.isArray(payload.items)
          ? payload.items
          : Array.isArray(payload.hits)
            ? payload.hits
            : [];
      const results = mapProducts(products);
      diagnostics.push({ endpoint: endpoint.name, url, ok: true, status, error: '', count: results.length });
      if (results.length > 0) {
        return {
          ok: true,
          endpoint: endpoint.name,
          results,
          diagnostics,
        };
      }
    } catch (error) {
      if (error?.name === 'AbortError') {
        try {
          const retryResponse = await fetchWithTimeout(url, Math.max(timeoutMs, 15000));
          const status = retryResponse.status;
          if (!retryResponse.ok) {
            diagnostics.push({
              endpoint: endpoint.name,
              url,
              ok: false,
              status,
              error: `HTTP ${status} (retry)`,
              count: 0,
            });
            continue;
          }
          const retryPayload = await retryResponse.json();
          const retryProducts = Array.isArray(retryPayload.products)
            ? retryPayload.products
            : Array.isArray(retryPayload.items)
              ? retryPayload.items
              : Array.isArray(retryPayload.hits)
                ? retryPayload.hits
                : [];
          const retryResults = mapProducts(retryProducts);
          diagnostics.push({
            endpoint: endpoint.name,
            url,
            ok: true,
            status,
            error: '',
            count: retryResults.length,
          });
          if (retryResults.length > 0) {
            return {
              ok: true,
              endpoint: endpoint.name,
              results: retryResults,
              diagnostics,
            };
          }
          continue;
        } catch (retryError) {
          diagnostics.push({
            endpoint: endpoint.name,
            url,
            ok: false,
            status: 0,
            error: retryError?.name === 'AbortError' ? 'Timeout OFF' : (retryError?.name || 'network_error'),
            count: 0,
          });
          continue;
        }
      }
      diagnostics.push({ endpoint: endpoint.name, url, ok: false, status: 0, error: error?.name || 'network_error', count: 0 });
    }
  }

  return {
    ok: false,
    endpoint: '',
    results: [],
    diagnostics,
  };
}
