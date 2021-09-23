import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { Subject } from 'rxjs';
import { webSocket, WebSocketSubject } from 'rxjs/webSocket';

const SERVER_LINK = '//localhost:5000/';

@Injectable()
export class DataService implements OnDestroy {
  private socket: WebSocketSubject<any>;
  public messagesSubject = new Subject();

  constructor(private httpClient: HttpClient) {
    this.socket = webSocket('ws:' + SERVER_LINK + 'ws');
  }

  connect() {
    if (this.socket.closed) { this.socket = webSocket('ws:' + SERVER_LINK + 'ws'); }
    this.socket.subscribe(
      msg => this.messagesSubject.next(msg),
      err => this.messagesSubject.next({error: err}),
      () => this.messagesSubject.next({message: 'Completed'})
    );
  }

  sendMessage(msg: string) {
    this.socket.next({message: msg});
  }

  getInfo() {
    return this.httpClient.get('http:' + SERVER_LINK + 'info');
  }

    
  getStreamHttp() {
    return this.httpClient.get('http:' + SERVER_LINK + 'stream/stream', { observe: 'events', responseType: 'text', reportProgress: true });
  }

  ngOnDestroy() {
    this.socket.complete();
  }
}