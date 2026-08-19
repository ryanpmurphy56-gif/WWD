public without sharing class EmployeePortalController {

    @AuraEnabled(cacheable=true)
    public static User getCurrentUser() {
        return [
            SELECT Id, Name, Email, Title, SmallPhotoUrl, Profile.Name
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];
    }

    @AuraEnabled(cacheable=true)
    public static Boolean isManager() {
        return FeatureManagement.checkPermission('Manage_Roster');
    }

    @AuraEnabled(cacheable=true)
    public static List<Roster_Shifts__c> getMyShifts() {
        return [
            SELECT Id, Name, Start_Time__c, End_Time__c,
                   Actual_Start_Time__c, Actual_End_Time__c,
                   Role__c, Status__c, Shift_Duration_Hours__c,
                   Date__c, Staff_Member__c, Staff_Member__r.Name
            FROM Roster_Shifts__c
            WHERE Staff_Member__c = :UserInfo.getUserId()
            AND Start_Time__c >= :DateTime.now().addDays(-30)
            ORDER BY Start_Time__c ASC
        ];
    }

    @AuraEnabled(cacheable=true)
    public static Roster_Shifts__c getNextShift() {
        List<Roster_Shifts__c> shifts = [
            SELECT Id, Name, Start_Time__c, End_Time__c,
                   Role__c, Status__c, Shift_Duration_Hours__c
            FROM Roster_Shifts__c
            WHERE Staff_Member__c = :UserInfo.getUserId()
            AND Start_Time__c >= :DateTime.now()
            AND Status__c = 'Scheduled'
            ORDER BY Start_Time__c ASC
            LIMIT 1
        ];
        return shifts.isEmpty() ? null : shifts[0];
    }

    @AuraEnabled(cacheable=true)
    public static Decimal getHoursThisWeek() {
        Date today = Date.today();
        Date sunday = today.toStartOfWeek();
        Date monday = sunday.addDays(1);
        if (today == sunday) {
            monday = sunday.addDays(-6);
        }
        DateTime weekStart = DateTime.newInstance(monday, Time.newInstance(0, 0, 0, 0));

        AggregateResult[] results = [
            SELECT SUM(Shift_Duration_Hours__c) total
            FROM Roster_Shifts__c
            WHERE Staff_Member__c = :UserInfo.getUserId()
            AND Status__c = 'Completed'
            AND Start_Time__c >= :weekStart
        ];
        if (results.isEmpty() || results[0].get('total') == null) return 0;
        return (Decimal)results[0].get('total');
    }

    @AuraEnabled(cacheable=true)
    public static Roster_Shifts__c getActiveShift() {
        List<Roster_Shifts__c> shifts = [
            SELECT Id, Name, Start_Time__c, Actual_Start_Time__c, Role__c
            FROM Roster_Shifts__c
            WHERE Staff_Member__c = :UserInfo.getUserId()
            AND Status__c = 'In Progress'
            LIMIT 1
        ];
        return shifts.isEmpty() ? null : shifts[0];
    }

    @AuraEnabled
    public static void punchIn(Id shiftId) {
        try {
            List<Roster_Shifts__c> shifts = [
                SELECT Id, Status__c, Actual_Start_Time__c
                FROM Roster_Shifts__c
                WHERE Id = :shiftId
                AND Staff_Member__c = :UserInfo.getUserId()
                LIMIT 1
            ];
            if (shifts.isEmpty()) {
                throw new AuraHandledException('Shift not found or does not belong to you.');
            }
            Roster_Shifts__c shift = shifts[0];
            if (shift.Status__c == 'In Progress') {
                throw new AuraHandledException('You are already punched in.');
            }
            shift.Actual_Start_Time__c = DateTime.now();
            shift.Status__c = 'In Progress';
            update shift;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to punch in: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static void punchOut(Id shiftId) {
        try {
            List<Roster_Shifts__c> shifts = [
                SELECT Id, Status__c, Actual_End_Time__c, Actual_Start_Time__c
                FROM Roster_Shifts__c
                WHERE Id = :shiftId
                AND Staff_Member__c = :UserInfo.getUserId()
                LIMIT 1
            ];
            if (shifts.isEmpty()) {
                throw new AuraHandledException('Shift not found or does not belong to you.');
            }
            Roster_Shifts__c shift = shifts[0];
            shift.Actual_End_Time__c = DateTime.now();
            shift.Status__c = 'Completed';
            update shift;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to punch out: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Roster_Shifts__c> getAllShifts(String startDate, String endDate) {
        DateTime start = DateTime.valueOf(startDate + ' 00:00:00');
        DateTime finish = DateTime.valueOf(endDate + ' 23:59:59');
        return [
            SELECT Id, Name, Start_Time__c, End_Time__c,
                   Role__c, Status__c, Shift_Duration_Hours__c,
                   Staff_Member__c, Staff_Member__r.Name, Date__c
            FROM Roster_Shifts__c
            WHERE Start_Time__c >= :start
            AND Start_Time__c <= :finish
            ORDER BY Start_Time__c ASC
        ];
    }

    @AuraEnabled
    public static Roster_Shifts__c createShift(Id employeeId, DateTime startTime,
                                                DateTime endTime, String role) {
        try {
            // Conflict detection
            List<Roster_Shifts__c> conflicts = [
                SELECT Id FROM Roster_Shifts__c
                WHERE Staff_Member__c = :employeeId
                AND Status__c != 'Cancelled'
                AND (
                    (Start_Time__c >= :startTime AND Start_Time__c < :endTime)
                    OR (End_Time__c > :startTime AND End_Time__c <= :endTime)
                    OR (Start_Time__c <= :startTime AND End_Time__c >= :endTime)
                )
                LIMIT 1
            ];
            if (!conflicts.isEmpty()) {
                throw new AuraHandledException('This employee already has a shift during that time.');
            }

            Roster_Shifts__c shift = new Roster_Shifts__c(
                Staff_Member__c = employeeId,
                Start_Time__c = startTime,
                End_Time__c = endTime,
                Role__c = role,
                Status__c = 'Scheduled'
            );
            insert shift;
            return shift;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to create shift: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static void deleteShift(Id shiftId) {
        try {
            delete new Roster_Shifts__c(Id = shiftId);
        } catch (Exception e) {
            throw new AuraHandledException('Failed to delete shift: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<User> getEmployees() {
        return [
            SELECT Id, Name, Email, Title, SmallPhotoUrl
            FROM User
            WHERE IsActive = true
            AND UserType = 'Standard'
            ORDER BY Name ASC
        ];
    }

    // Employee_User__c (Lookup → User) is the requester. The original
    // Employee__c field points at the unused standard Employee object and can
    // never hold a User id, which silently broke this whole feature.
    @AuraEnabled(cacheable=true)
    public static List<Time_Off_Request__c> getMyTimeOffRequests() {
        return [
            SELECT Id, Start_Date__c, End_Date__c, Reason__c,
                   Status__c, Manager_Notes__c, CreatedDate
            FROM Time_Off_Request__c
            WHERE Employee_User__c = :UserInfo.getUserId()
            ORDER BY CreatedDate DESC
        ];
    }

    @AuraEnabled
    public static void submitTimeOffRequest(Date startDate, Date endDate, String reason) {
        try {
            Time_Off_Request__c request = new Time_Off_Request__c(
                Employee_User__c = UserInfo.getUserId(),
                Start_Date__c = startDate,
                End_Date__c = endDate,
                Reason__c = reason,
                Status__c = 'Pending'
            );
            insert request;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to submit request: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Time_Off_Request__c> getPendingTimeOffRequests() {
        return [
            SELECT Id, Employee_User__c, Employee_User__r.Name,
                   Start_Date__c, End_Date__c, Reason__c,
                   Status__c, Manager_Notes__c
            FROM Time_Off_Request__c
            WHERE Status__c = 'Pending'
            ORDER BY CreatedDate ASC
        ];
    }

    @AuraEnabled
    public static void updateTimeOffRequest(Id requestId, String status, String notes) {
        try {
            Time_Off_Request__c request = new Time_Off_Request__c(
                Id = requestId,
                Status__c = status,
                Manager_Notes__c = notes
            );
            update request;
        } catch (Exception e) {
            throw new AuraHandledException('Failed to update request: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Roster_Shifts__c> getUpcomingShifts() {
        return [
            SELECT Id, Name, Start_Time__c, End_Time__c,
                   Role__c, Status__c, Shift_Duration_Hours__c
            FROM Roster_Shifts__c
            WHERE Staff_Member__c = :UserInfo.getUserId()
            AND Start_Time__c >= :DateTime.now()
            AND Status__c = 'Scheduled'
            ORDER BY Start_Time__c ASC
            LIMIT 3
        ];
    }

}