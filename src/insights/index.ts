import { defineEndpoint } from '@directus/extensions';
import { parseResults } from './parseQueryResults';
import { OnFilterEvents, RequestPayload, ResponsePayload } from './types';

export default defineEndpoint((router, { database, services, emitter }) => {
  const { PanelsService } = services;

  async function getPanelQuery(req: any) {
    const panelId = req.params.panelId;
    if (!panelId) throw new Error('Missing panelId');

    const service = new PanelsService({
      accountability: req.accountability,
      schema: req.schema,
    });
    const panel = (await service.readOne(panelId)) as {
      id: string;
      dashboard: string;
      options: {
        sql: string;
        cache: number;
      };
    };

    let { variables, query }: RequestPayload = await emitter.emitFilter(OnFilterEvents.REQUEST, {
      variables: Object.assign({ dashboard: panel.dashboard }, req.query ?? {}),
      query: panel.options.sql,
    }, req);

    for (const q in variables) {
      // Throw if q isn't a clean variable name
      if (!q.match(/^[a-zA-Z0-9_]+$/)) {
        throw new Error(`Invalid variable name: ${q}`);
      }
      if (isValidDateFormat(variables[q])) {
        query = query.replace(new RegExp(`{{${q}}}`, 'g'), new Date(variables[q]).getTime());
      } else {
        query = query.replace(new RegExp(`{{${q}}}`, 'g'), variables[q]);
      }
    }
    return {
      query,
      variables,
      panel,
    };
  }

  async function executeQuery(sql: string, vars: Record<string, any>) {
    const blacklistSql = new RegExp(
      ['delete', 'update', 'insert', 'execute', 'kill', 'drop'].map(item => `\\b${item}\\b`).join('|')
    );
    if (blacklistSql.test(sql.toLowerCase())) {
      throw new Error('SQL query is blacklisted');
    }

    const missingParams = sql.match(/{{\w+}}/g);
    if (missingParams) {
      throw new Error(`Missing query param: ${missingParams.join(', ').replace(/{{|}}/g, '')}`);
    }
    const result = await database.raw(sql, vars);
  
    return parseResults(result);
  }

  function isValidDateFormat(dateString: string): boolean {
    // Regular expression to match YYYY-MM-DD format
    const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
    
    // First, check if the string matches the basic format
    if (!dateFormatRegex.test(dateString)) {
      return false;
    }
    
    // Create a Date object to validate the actual date
    const date = new Date(dateString);
    
    // Check if the date is valid and matches the original string
    return date.toISOString().slice(0, 10) === dateString;
  }

  router.get('/query/:panelId', async (req, res) => {
		try {
    	const { query, variables, panel } = await getPanelQuery(req);
      let result: ResponsePayload = await executeQuery(query, variables);
      result = await emitter.emitFilter(OnFilterEvents.RESPONSE, result, req);      

      // Default cache of 300 seconds
      let cache = Number(panel.options.cache ?? 300)
      cache = cache > 0 ? cache : 300
      res.set('Cache-control', `public, max-age=${cache}`)
			return res.json(result);
		} catch (err) {
      return res.status(400).json({ error: (err as Error).message })
		}
  });

});
