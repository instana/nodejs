import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { catchError, tap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'eum-serverless-collector';
  private serverUrl = 'http://localhost:9191/trace';

  constructor(private httpClient: HttpClient) {}

  onButtonClick(): void {
    console.log('Button clicked');

    // add headers to get request
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });

    this.httpClient
      .get(this.serverUrl, { headers })
      .pipe(catchError(this.handleError))
      .subscribe({
        next: response => console.log('Response received:', response),
        error: error => console.error('Request failed:', error)
      });
  }

  private handleError(error: HttpErrorResponse) {
    if (error.status === 200) {
      alert('Success');
      return new Observable();
    }

    if (error.error instanceof ErrorEvent) {
      alert(`Client-side error: ${error.error.message}`);
    } else {
      alert(`Server error (code ${error.status}, error: ${error.message})`);
    }

    return throwError(() => new Error('Something went wrong. Please try again later.'));
  }
}
