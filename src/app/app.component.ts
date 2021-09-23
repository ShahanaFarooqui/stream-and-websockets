import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { filter, map, takeUntil } from 'rxjs/operators';
import { DataService } from './data.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  public info$: Observable<any> = new Observable();
  public wsMessages: String[] = [];
  public eventMessages: String[] = [];
  public httpMessages: String[] = [];
  public counter = 0;
  private unSubs: Array<Subject<void>> = [new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject()];

  constructor(private dataService: DataService, private cdref: ChangeDetectorRef) {}

  ngOnInit() {
    this.getStreamSSE();
    this.dataService.connect();
    this.dataService.messagesSubject.pipe(takeUntil(this.unSubs[0])).subscribe(
      msg => { this.wsMessages.push(typeof msg === 'string' ? msg : JSON.stringify(msg)); },
      err => { this.wsMessages.push(JSON.stringify(err)); },
      () => { this.wsMessages.push(JSON.stringify({message: 'Completed'})); }
    );
    this.dataService.getStreamHttp().pipe(takeUntil(this.unSubs[1]), filter((e: any) => e.type === 3 && e.partialText)).subscribe(
      msg => { const cleanedData = msg.partialText.trim().split('\n').pop().substring(5); this.httpMessages.push(JSON.parse(cleanedData)); },
      err => { this.httpMessages.push(err); }
    );
    this.info$ = this.dataService.getInfo();
  }

  onSendMessage() {
    this.counter++;
    this.dataService.sendMessage('Message from the Browser ' + this.counter);
  }

  getStreamSSE() {
    const eventSource = new EventSource('http://localhost:5000/stream/stream');
    eventSource.onmessage = (event: any) => {
      this.eventMessages.push(JSON.parse(event.data));
      this.cdref.detectChanges();
    }
    eventSource.onerror = (error: any) => {
      this.eventMessages.push(error);
    }
  }

  ngOnDestroy() {
    this.unSubs.forEach((completeSub) => {
      completeSub.next();
      completeSub.complete();
    });
  }

}
