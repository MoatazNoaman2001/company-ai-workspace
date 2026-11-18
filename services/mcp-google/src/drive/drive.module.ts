import { Inject, Injectable, Module } from '@nestjs/common';
import { DriveClient, type FetchFn } from './drive.client.js';

/** The fetch implementation used for Google APIs (overridden in tests). */
export const DRIVE_FETCH = Symbol('DRIVE_FETCH');

/** Creates a Drive client bound to one user's access token. Nothing is cached between requests. */
@Injectable()
export class DriveService {
  constructor(@Inject(DRIVE_FETCH) private readonly fetchFn: FetchFn) {}

  forUser(accessToken: string): DriveClient {
    return new DriveClient(accessToken, this.fetchFn);
  }
}

@Module({
  providers: [{ provide: DRIVE_FETCH, useValue: (...args: Parameters<typeof fetch>) => fetch(...args) }, DriveService],
  exports: [DriveService],
})
export class DriveModule {}
