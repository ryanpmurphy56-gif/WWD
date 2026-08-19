public without sharing class SelfRegController {

    @AuraEnabled
    public static String registerUser(
        String firstName,
        String lastName,
        String email,
        String password,
        String confirmPassword
    ) {

        // Basic validation
        if(String.isBlank(firstName) || String.isBlank(lastName) || String.isBlank(email)){
            throw new AuraHandledException('Please fill in all required fields.');
        }

        if(password == null || password.length() < 8){
            throw new AuraHandledException('Password must be at least 8 characters.');
        }

        if(password != confirmPassword){
            throw new AuraHandledException('Passwords do not match.');
        }

        if(!isValidEmail(email)){
            throw new AuraHandledException('Invalid email address.');
        }

        try {
            String cleanEmail = email.trim().toLowerCase();

            // Prevent duplicate users
            List<User> existing = [
                SELECT Id
                FROM User
                WHERE Username = :cleanEmail
                LIMIT 1
            ];
            if(!existing.isEmpty()){
                throw new AuraHandledException('An account with this email already exists.');
            }

            // Get Community Profile
            Profile p = [
                SELECT Id
                FROM Profile
                WHERE Name = 'Customer Community User'
                LIMIT 1
            ];

            Id ownerId = UserInfo.getUserId();

            // Create Account
            Account acct = new Account(
                Name = firstName + ' ' + lastName,
                OwnerId = ownerId,
                Birthdate__c = Date.valueOf('2000-01-01'),
                Join_Date__c = Date.today(),
                Email__c = cleanEmail,
                Phone_Number__c = '0400000000'
            );
            insert acct;

            // Create Contact for the User
            Contact c = new Contact(
                FirstName = firstName,
                LastName = lastName,
                Email = cleanEmail,
                AccountId = acct.Id
            );
            insert c;

            // Create User
            User newUser = new User(
                FirstName = firstName.trim(),
                LastName = lastName.trim(),
                Email = cleanEmail,
                Username = cleanEmail,
                Alias = (firstName.substring(0,1) + lastName.substring(0,Math.min(7,lastName.length()))).toLowerCase(),
                CommunityNickname = generateNickname(firstName,lastName),
                ProfileId = p.Id,
                LocaleSidKey = 'en_AU',
                LanguageLocaleKey = 'en_US',
                TimeZoneSidKey = 'Australia/Sydney',
                EmailEncodingKey = 'UTF-8',
                ContactId = c.Id
            );

            String userId = Site.createExternalUser(newUser, acct.Id, password);

            if(userId == null){
                throw new AuraHandledException('Unable to create user.');
            }

            // Async membership card creation
            createMembershipCardAsync(userId);

            return 'SUCCESS';

        } catch(Exception e) {
            System.debug('REGISTRATION ERROR: ' + e.getMessage());
            throw new AuraHandledException('Registration failed: ' + e.getMessage());
        }
    }

    // FUTURE method prevents mixed DML errors
    @future
    private static void createMembershipCardAsync(String userId){
        try {
            User u = [
                SELECT Id, AccountId, ContactId, FirstName, LastName
                FROM User
                WHERE Id = :userId
                LIMIT 1
            ];

            if(u.AccountId == null || u.ContactId == null){
                return;
            }

            Members_Card__c card = new Members_Card__c(
                Account__c = u.AccountId,
                Contact__c = u.ContactId,
                Name = u.FirstName + ' ' + u.LastName + ' Membership',
                Start_Date__c = Date.today(),
                Expiry_Date__c = Date.today().addYears(1)
            );

            insert card;

        } catch(Exception e) {
            System.debug('Membership card creation failed: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String loginUser(String email, String password){
        if(String.isBlank(email) || String.isBlank(password)){
            throw new AuraHandledException('Please enter email and password.');
        }

        try {
            ApexPages.PageReference startUrl = Site.login(
                email.trim().toLowerCase(),
                password,
                '/'
            );

            if(startUrl != null){
                return startUrl.getUrl();
            }

            throw new AuraHandledException('Invalid login details.');

        } catch(Exception e) {
            throw new AuraHandledException('Login failed: ' + e.getMessage());
        }
    }

    private static String generateNickname(String firstName, String lastName){
        String base = (firstName + lastName).replaceAll('[^a-zA-Z0-9]', '').toLowerCase();
        if(base.length() > 30){
            base = base.substring(0,30);
        }
        return base + String.valueOf(Math.abs(Crypto.getRandomInteger())).substring(0,4);
    }

    private static Boolean isValidEmail(String email){
        return Pattern.matches(
            '^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$',
            email
        );
    }
}