import { Meteor } from 'meteor/meteor';

/**
 * Log a user in with their password
 */
const Auth = {
  loginWithPassword(user, password) {
    if(!user || !password) {
      throw new Meteor.Error(401, 'Unauthorized');
    }

    // A valid user will have exactly one of the following identification fields: id, username, or email
  	check(user, Match.Where(user => {
      check(user, {
        id:       Match.Optional(String),
        username: Match.Optional(String),
        email:    Match.Optional(String),
      });
      if(_.keys(user).length === !1) {
        throw new Match.Error('User must have exactly one identifier field');
      }
      return true;
    }));

    // A password can be either in plain text or hashed
  	check(password, Match.OneOf(String, {
      digest:   String,
      algorithm: String,
    }));

  	// Retrieve the user from the database
  	const authenticatingUser = Meteor.users.findOne(
      _.extend(
        {'services.password': {$exists: true}},
        getUserQuerySelector(user)
      )
    );
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
  		authToken: authToken.token,
  		userId:    authenticatingUser._id,
  	};
  }
};

export { Auth };


/**
 * Return a MongoDB query selector for finding the given user
 * @param user
 * @returns {*}
 */
function getUserQuerySelector(user) {
  switch(true) {
    case(!!user.id):       return {_id: user.id};
    case(!!user.username): return {username: user.username};
    case(!!user.email):    return {'emails.address': user.email};
  }
  // We shouldn't be here if the user object was properly validated
  throw new Error('Cannot create selector from invalid user');
};
