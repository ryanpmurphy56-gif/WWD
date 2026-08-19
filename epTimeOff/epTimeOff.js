import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getMyTimeOffRequests from '@salesforce/apex/EmployeePortalController.getMyTimeOffRequests';
import submitTimeOffRequest from '@salesforce/apex/EmployeePortalController.submitTimeOffRequest';

export default class EpTimeOff extends LightningElement {
    @track requests = [];
    @track startDate = '';
    @track endDate = '';
    @track reason = '';

    @wire(getMyTimeOffRequests)
    wiredRequests({ data }) {
        if (data) {
            this.requests = data.map(r => ({
                ...r,
                _dateRange: new Date(r.Start_Date__c).toLocaleDateString('en-AU') +
                            ' — ' + new Date(r.End_Date__c).toLocaleDateString('en-AU'),
                _statusClass: 'status-badge status-' + r.Status__c.toLowerCase()
            }));
        }
    }

    get hasRequests() { return this.requests && this.requests.length > 0; }

    handleInput(event) {
        const field = event.target.dataset.field;
        this[field] = event.target.value;
    }

    handleSubmit() {
        if (!this.startDate || !this.endDate || !this.reason) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Missing Fields',
                message: 'Please fill in all fields.',
                variant: 'warning'
            }));
            return;
        }
        submitTimeOffRequest({
            startDate: this.startDate,
            endDate: this.endDate,
            reason: this.reason
        })
        .then(() => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Request Submitted',
                message: 'Your time off request has been submitted.',
                variant: 'success'
            }));
            this.startDate = '';
            this.endDate = '';
            this.reason = '';
            return refreshApex(this.wiredRequests);
        })
        .catch(error => console.error(error));
    }
}