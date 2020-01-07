import { Meteor } from 'meteor/meteor';

/**
 * Log a user in with their password
 */
const Auth = {
  loginWithPassword(user, password) {
    if(_.keys(user).length === !1 || !password) {
      throw new Meteor.Error(401, 'Unauthorized');
    }

    // A password can be either in plain text or hashed
    try {
      check(password, Match.OneOf(String, {
        digest:   String,
        algorithm: String,
      }));
    } catch(e) {
      throw new Meteor.Error(401, 'Unauthorized');
    }

    // Retrieve the user from the database
    const authenticatingUser = Meteor.users.findOne({
      $or: [
        {_id: `${user.id || ''}`},
        {username: `${user.username || ''}`},
        {'emails.address': `${user.email || ''}`},
      ],
      'services.password': {$exists: true},
    });
  	if(!authenticatingUser) {
  		throw new Meteor.Error(401, 'Unauthorized');
  	}

  	// Authenticate the user's password
  	const passwordVerification = Accounts._checkPassword(authenticatingUser, password);
  	if(passwordVerification.error) {
  		throw new Meteor.Error(401, 'Unauthorized');
  	}

  	// Add a new auth token to the user's account
  	const authToken = Accounts._generateStampedLoginToken();
  	const hashedToken = Accounts._hashLoginToken(authToken.token);
  	Accounts._insertHashedLoginToken(authenticatingUser._id, {hashedToken});

  	return {
      userId:    authenticatingUser._id,
  		authToken: authToken.token,
  	};
  },
};

export { Auth };
