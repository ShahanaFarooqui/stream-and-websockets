import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';
import { environment } from 'src/environments/environment';
import { delay, filter, map, retryWhen, switchMap } from 'rxjs/operators';

const SERVER_LINK = environment.API_URL + '/api/';

@Injectable()
export class DataService implements OnDestroy {
  private socket: WebSocketSubject<any> | undefined;
  private RETRY_SECONDS = 10; 

  constructor(private httpClient: HttpClient) {}

  connectWebSocket(): Observable<any> {
    // const wsURL = this.store.pipe(select(getApiUrl));
    const wsURL = of(window.location.port === '5200' ? 'http://localhost:5000' : window.location.origin);
    return wsURL.pipe(
    filter(apiUrl => !!apiUrl),
    map((apiUrl: string) => apiUrl.replace(/^http/, 'ws') + '/api/ws'),
    switchMap((finalWSUrl: string) => {
      if (this.socket) {
        return this.socket;
      } else {
        this.socket = webSocket(finalWSUrl);
        return this.socket;
      }
    }),
    retryWhen(errors => errors.pipe(
      map(err => { console.error(err); return err; }),
      delay(this.RETRY_SECONDS)
    )));
  }

  sendMessage(msg: string) {
    if (this.socket) {
      const payload = { token: 'token_from_session_service', message: msg };
      this.socket.next(payload);
    }
  }

  getInfo() {
    return this.httpClient.get(SERVER_LINK + 'info');
  }

  getStreamHttp() {
    // Less reliable for the first client connection; Leaving for reference only, not to be used.
    return this.httpClient.get(SERVER_LINK + 'stream/events', { observe: 'events', responseType: 'text', reportProgress: true });
  }

  closeConnection() {
    if (this.socket) {
      this.socket.complete();
      this.socket = undefined;
    }
  }

  ngOnDestroy() {
    this.closeConnection();
  }

}
