import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { DataService } from './data.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
  @HostListener('window:beforeunload', ['$event'])
  unloadHandler(event: Event) {
    this.onClose();      
  }
  public info$: Observable<any> = new Observable();
  public wsMessages: String[] = [];
  public eventMessages: String[] = [];
  public httpMessages: String[] = [];
  public counter = 0;
  public eventSource: EventSource = new EventSource('http://192.168.1.7:5000/api/stream/stream');
  private unSubs: Array<Subject<void>> = [new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject(), new Subject()];

  constructor(private dataService: DataService, private cdref: ChangeDetectorRef) {}

  ngOnInit() {
    let self = this;
    window.addEventListener('beforeunload', function (event) {
      event.preventDefault();
      self.eventSource.close();
      self.dataService.closeSocket();
    });
    this.getStreamSSE();
    this.dataService.connect();
    this.dataService.messagesSubject.pipe(takeUntil(this.unSubs[0])).subscribe(
      msg => { this.wsMessages.push(typeof msg === 'string' ? msg : JSON.stringify(msg)); },
      err => { this.wsMessages.push(JSON.stringify(err)); },
      () => { this.wsMessages.push(JSON.stringify({message: 'Completed'})); }
    );
    this.dataService.getStreamHttp().pipe(takeUntil(this.unSubs[1]), filter((e: any) => e.type === 3 && e.partialText)).subscribe(
      msg => { 
        const cleanedData = msg.partialText.trim().split('\n').pop().substring(5); 
        this.httpMessages.push(JSON.parse(cleanedData));
        console.info(cleanedData);
        console.info(this.httpMessages);
      },
      err => { this.httpMessages.push(err); }
    );
    this.info$ = this.dataService.getInfo();
  }

  onClose() {
    this.eventSource.close();
    this.dataService.closeSocket();
  }

  onSendMessage() {
    this.counter++;
    this.dataService.sendMessage('Message from the Browser ' + this.counter);
  }

  getStreamSSE() {
    this.eventSource.onmessage = (event: any) => {
      this.eventMessages.push(JSON.parse(event.data));
      this.cdref.detectChanges();
    }
    this.eventSource.onerror = (error: any) => {
      this.eventMessages.push(error);
    }
  }

  ngOnDestroy() {
    this.eventSource.close();
    this.dataService.closeSocket();
    this.unSubs.forEach((completeSub) => {
      completeSub.next();
      completeSub.complete();
    });
  }

}
