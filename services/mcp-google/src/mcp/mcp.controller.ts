import { All, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { Caller, CallerGuard, type CallerContext } from '../common/caller/caller.guard.js';
import { McpService } from './mcp.service.js';

/** MCP Streamable HTTP endpoint (stateless: one server + transport per request). */
@Controller('mcp')
export class McpController {
  constructor(@Inject(McpService) private readonly mcp: McpService) {}

  @Post()
  @UseGuards(CallerGuard)
  async handle(@Req() req: Request, @Res() res: Response, @Caller() caller: CallerContext): Promise<void> {
    const server = this.mcp.buildServer(caller);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /** Stateless server: no SSE stream or session to resume or delete. */
  @All()
  @HttpCode(405)
  notAllowed(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Allow', 'POST');
    return { error: { code: 'method_not_allowed', message: 'Use POST.' } };
  }
}
