/** Sends the pending supplier order sheets — scheduled for 6am every Monday. */
public without sharing class WeeklyReorderScheduler implements Schedulable {
    public void execute(SchedulableContext sc) {
        try {
            ReorderController.sendOrderSheets();
        } catch (Exception e) {
            System.debug('WeeklyReorderScheduler failed: ' + e.getMessage());
        }
    }
}