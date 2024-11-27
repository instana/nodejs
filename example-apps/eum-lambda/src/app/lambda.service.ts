import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LambdaService {
  private lambdaUrl = 'YOUR_LAMBDA_ENDPOINT_URL'; // Replace with your actual Lambda endpoint

  constructor(private http: HttpClient) {}

  invokeLambda(): Observable<any> {
    return this.http.get<any>(this.lambdaUrl);
  }
}
