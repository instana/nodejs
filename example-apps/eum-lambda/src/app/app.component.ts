import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'eum-lambda';
  private lambdaUrl = 'https://tsbrw5r7sgqccjyek7bypgkvjq0mvait.lambda-url.us-east-1.on.aws/';

  constructor(private httpClient: HttpClient) {}

  onButtonClick(): void {
    const payload = { key: 'value' };
    const headers = new HttpHeaders();
    headers
      .set('Content-Type', 'application/json')
      .set('Access - Control - Allow - Origin', '*')
      .set('X-Amz-Invocation-Type', 'RequestResponse')
      .set('X-Amz-Log-Type', 'Tail');
    this.httpClient
      .post(this.lambdaUrl, payload, { headers })
      .pipe(
        catchError((error: HttpErrorResponse) => {
          if (error.error instanceof ErrorEvent) {
            console.error('An error occurred:', error.error.message);
            alert('Lambda function response: ' + JSON.stringify(error));
          } else {
            console.error(`Backend returned code ${error.status}, ` + `body was: ${error.error}`);
            alert(`Backend returned code ${error.status}, ` + `body was: ${JSON.stringify(error)}`);
          }
          return throwError('Something bad happened; please try again later.');
        })
      )
      .subscribe(response => {
        console.log('Lambda function response:', response);
        alert('Lambda function response: ' + JSON.stringify(response));
      });
  }
}
