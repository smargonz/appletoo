/* Adapted by Nathan Hoffman -- July 28th 2012
 * hoffman.nathan89@gmail.com
 * AppleToo Disk object for Dos 3.3 disk consisting of:
 * 35 tracks per side
 * 16 sectors per track
 * 256 bytes per sector
 *
 * 4 phase stepper motor, 0-3
 * 0xc080 sm phase 0 off
 * 0xc081 sm phase 0 on
 * 0xc082 sm phase 1 off
 * 0xc083 sm phase 1 on
 * 0xc084 sm phase 2 off
 * 0xc085 sm phase 2 off
 * 0xc086 sm phase 3 off
 * 0xc087 sm phase 3 on
 * 0xc088 turn motor off
 * 0xc089 turn motor on
 * 0xc08a engage drive 1
 * 0xc08b engage drive 2
 * 0xc08c strobe data latch for i/o
 * 0xc08d load data latch
 * 0xc08e prepare latch for input
 * 0xc08f prepare latch for output

 * 0xc08e with 0xc08c Read
 * 0xc08e with 0xc08d Sense Write Protect
 * 0xc08f with 0xc08c Write
 * 0xc08f with 0xc08d Load Write Latch
 */


var DiskToo = function (appleToo, numDrives) {
  this.appleToo = appleToo;
  this.drives = [];
  this.currentDrive = 0;
  this.latchData  = 0;
  this.phases = [0,0,0,0];
  this.currentPhase = 0;
  this.lastPhase = 0; //Won't be used until called again
  this.isMotorOn = false;
  this.diskData = [];
  this.isWriteProtected = [];
  this.currPhysTrack = 0; //Somewhere between 0-143 including half-tracks
  this.currTrack = 0; //number between 0-35 indicating the current track
  this.driveCurrPhysTrack = [];
  this.realTrack = [];
  this.writeMode = false;
  this.loadMode = false;
  this.driveSpin = false;


  for (var i = 0; i < numDrives.length; i++) {
    this.drives.push({phase: 0});
  }
};


DiskToo.prototype.update_soft_switch = function(address, value) {
  switch (address & 0xf) {
    case 0x0:
    case 0x1:
    case 0x2:
    case 0x3:
    case 0x4:
    case 0x5:
    case 0x6:
    case 0x7:
      this.setPhaseMotors(address);
      break;
    case 0x8:
      this.isMotorOn = false;
      break;
    case 0x9:
      this.isMotorOn = true;
      break;
    case 0xa:
      this.setDrive(0);
      break;
    case 0xb:
      this.setDrive(1);
      break;
    case 0xc:
      this.ioLatchC();
      break;
    case 0xd:
      this.loadMode = true;
	if (value === undefined && this.isMotorOn && !this.writeMode) {
          this.latchData &= 0x7F;
        // TODO: check phase - write protect is forced if phase 1 is on [F9.7]
          if (this.isWriteProtected[this.drive]) {
            this.latchData |= 0x80;
          }
        }
      break;
    case 0xe:
      this.writeMode = false;
      break;
    case 0xf:
      this.writeMode = true;
      break;
  }
  if (value !== undefined && this.isMotorOn && this.writeMode && this.loadMode) {
    // any address writes latch for sequencer LD; OE1/2 irrelevant ['323 datasheet]
    this.latchData = value;
  }
  if (value === undefined && (address & 1) == 0) {
    // only even addresses return the latch
    if (this.isMotorOn) {
      return this.latchData;
    }

    // simple hack to fool DOS SAMESLOT drive spin check (usually at $BD34)
    this.driveSpin = !this.driveSpin;
    return this.driveSpin ? 0x7E : 0x7F;
  }
  return 0; // TODO: floating bus

};

DiskToo.prototype.setPhaseMotors = function (addr) {

  switch (addr & 0xf) {
    case 0x0:
      this.phases[0] = 0;
      break;
    case 0x1:
      this.phases[0] = 1;
      break;
    case 0x2:
      this.phases[1] = 0;
      break;
    case 0x3:
      this.phases[1] = 1;
      break;
    case 0x4:
      this.phases[2] = 0;
      break;
    case 0x5:
      this.phases[2] = 1;
      break;
    case 0x6:
      this.phases[3] = 0;
      break;
    case 0x7:
      this.phases[3] = 1;
      break;
    default:
      break;
  }


};

DiskToo.prototype.findDirection = function (currTrack, finalTrack) {
  var goingUp = false;
  var prevPhase = undefined;
  var finalPhase = undefined;
  var otherMotor = undefined;
  var moved = false;

  switch (finalTrack.reduce( function ( a, b ) { return a + b; })) {
    case 1: //This implies that you are at a full physical track
      finalPhase = finalTrack.indexOf(1);
      currTrack[finalPhase] = 0;
      otherMotor = currTrack.indexOf(1);
      goingUp = finalPhase < otherMotor ? false : true;
      if (Math.abs(finalPhase - otherMotor) > 1){goingUp = !goingUp;}
      moved = true;
      break;

    case 2: //Implies that the motor stops on a half-phase
      prevPhase = currTrack.indexOf(1);
      finalTrack[prevPhase] = 0;
      otherMotor = finalTrack.indexOf(1);
      goingUp = prevPhase > otherMotor ? false : true;
      //Edge case, if we are using the 3rd and 0th motor
      if (Math.abs(prevPhase - otherMotor) > 1){goingUp = !goingUp;}
      moved = true;
      break;
    case 0: //No motors -- no change, weird combination.
      break;
    default:
      throw new Error("Too many motors on at once!");
  }

  if(moved) {
    this.currPhysTrack = goingUp ? this.currPhysTrack + 1: this.currPhysTrack - 1;
   //TODO: implement the actual track variable.

  }
};

DiskToo.prototype.readDisk = function (diskData) {
  var buffer = [];
  diskData = diskData.replace(/\s+/g,"");

  for (var i=0; i < diskData.length; i += 2) {
    buffer[i] = parseInt(diskData.substr(i, 2), 16);
  }
};

DiskToo.prototype.setDrive = function (driveNum) {
    if (driveNum < 2 && driveNum > 0) {
      this.currentDrive = driveNum;
    };
}

function encode44(byte) {
  var evenByte = (byte | 0xAA),
      oddByte = (byte >> 1 | 0xAA);
  return [oddByte, evenByte];
}

function decode44(byteArray) {
  var evenByte = byteArray[1],
      oddByte = byteArray[0],
      byte = (evenByte & ((oddByte << 1) | 0x01));
  return byte;
}


DiskToo.ROM = [
		0xA2,0x20,0xA0,0x00,0xA2,0x03,0x86,0x3C,0x8A,0x0A,0x24,0x3C,0xF0,0x10,0x05,0x3C,
		0x49,0xFF,0x29,0x7E,0xB0,0x08,0x4A,0xD0,0xFB,0x98,0x9D,0x56,0x03,0xC8,0xE8,0x10,
		0xE5,0x20,0x58,0xFF,0xBA,0xBD,0x00,0x01,0x0A,0x0A,0x0A,0x0A,0x85,0x2B,0xAA,0xBD,
		0x8E,0xC0,0xBD,0x8C,0xC0,0xBD,0x8A,0xC0,0xBD,0x89,0xC0,0xA0,0x50,0xBD,0x80,0xC0,
		0x98,0x29,0x03,0x0A,0x05,0x2B,0xAA,0xBD,0x81,0xC0,0xA9,0x56,0xa9,0x00,0xea,0x88,
		0x10,0xEB,0x85,0x26,0x85,0x3D,0x85,0x41,0xA9,0x08,0x85,0x27,0x18,0x08,0xBD,0x8C,
		0xC0,0x10,0xFB,0x49,0xD5,0xD0,0xF7,0xBD,0x8C,0xC0,0x10,0xFB,0xC9,0xAA,0xD0,0xF3,
		0xEA,0xBD,0x8C,0xC0,0x10,0xFB,0xC9,0x96,0xF0,0x09,0x28,0x90,0xDF,0x49,0xAD,0xF0,
		0x25,0xD0,0xD9,0xA0,0x03,0x85,0x40,0xBD,0x8C,0xC0,0x10,0xFB,0x2A,0x85,0x3C,0xBD,
		0x8C,0xC0,0x10,0xFB,0x25,0x3C,0x88,0xD0,0xEC,0x28,0xC5,0x3D,0xD0,0xBE,0xA5,0x40,
		0xC5,0x41,0xD0,0xB8,0xB0,0xB7,0xA0,0x56,0x84,0x3C,0xBC,0x8C,0xC0,0x10,0xFB,0x59,
		0xD6,0x02,0xA4,0x3C,0x88,0x99,0x00,0x03,0xD0,0xEE,0x84,0x3C,0xBC,0x8C,0xC0,0x10,
		0xFB,0x59,0xD6,0x02,0xA4,0x3C,0x91,0x26,0xC8,0xD0,0xEF,0xBC,0x8C,0xC0,0x10,0xFB,
		0x59,0xD6,0x02,0xD0,0x87,0xA0,0x00,0xA2,0x56,0xCA,0x30,0xFB,0xB1,0x26,0x5E,0x00,
		0x03,0x2A,0x5E,0x00,0x03,0x2A,0x91,0x26,0xC8,0xD0,0xEE,0xE6,0x27,0xE6,0x3D,0xA5,
		0x3D,0xCD,0x00,0x08,0xA6,0x2B,0x90,0xDB,0x4C,0x01,0x08,0x00,0x00,0x00,0x00,0x00
 ];
