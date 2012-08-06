/*
 * This file will hold the tests for the Disk II emulator to make sure
 * the functionality of each piece can be guaranteed moving forward
 * 
 * */

var a2,
    diskToo,
    setupTeardown = {
	setup: function(){
	    a2 = new AppleToo();
	    diskToo = new DiskToo(a2, 2);
	    a2.setPeripheral( diskToo, 6 );
	},
	teardown: function() {
	    a2 = undefined;
	    diskToo = undefined;
        }
    },
    unset_flags = {N:0, V:0, _:0, B:0, D:0, I:0, Z:0, C:0},
    zero_flag = clone(unset_flags),
    neg_flag = clone(unset_flags),
    carry_flag = clone(unset_flags),
    overflow_neg_flag = clone(unset_flags),
    overflow_carry_flag = clone(unset_flags),
    dec_flag = clone(unset_flags),
    dec_carry_flag = clone(unset_flags),
    carry_neg_flag = clone(unset_flags),
    carry_zero_flag = clone(unset_flags);

zero_flag["Z"] = 1;
neg_flag["N"] = 1;
carry_flag["C"] = 1;
overflow_neg_flag["V"] = 1;
overflow_neg_flag["N"] = 1;
overflow_carry_flag["V"] = 1;
overflow_carry_flag["C"] = 1;
dec_flag["D"] = 1;
dec_carry_flag["D"] = 1;
dec_carry_flag["C"] = 1;
carry_neg_flag["C"] = 1;
carry_neg_flag["N"] = 1;
carry_zero_flag["C"] = 1;
carry_zero_flag["Z"] = 1;

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

module("Apple 2 initialization", setupTeardown);
test("Initialization", function(){
  expect(1);
  diskToo.appleToo.set_register("XR", "01");
  equal(diskToo.appleToo.XR, 1);

});

module("Isolated soft switch", setupTeardown);
test("Soft Switch Motor Toggle", function() {
  expect(1);
  diskToo.update_soft_switch(0xBB69, true);
  equal(diskToo.isMotorOn, true);
});

test("Soft Switch Select Drive 0", function() {
  expect(1);
  diskToo.update_soft_switch(0xC06a, 0x1337);
  equal(diskToo.currentDrive, 0);
});

test("Soft Switch Select Drive 1", function() {
  expect(1);
  diskToo.update_soft_switch(0xC06b, 0x1337);
  equal(diskToo.currentDrive, 1);
});

test("Phase Ascending Tracks", function() {
  expect(5);
  diskToo.phases = [0,0,0,0];
  diskToo.update_soft_switch(0xC081, 0x1337);
  equal(diskToo.phases.toString(), [1,0,0,0].toString());
  diskToo.update_soft_switch(0xC083, 0x1337);
  equal(diskToo.phases.toString(), [1,1,0,0].toString());
  equal(diskToo.currPhysTrack, 1);
  diskToo.update_soft_switch(0xC080, 0x1337);
  diskToo.update_soft_switch(0xC085, 0x1337);
  diskToo.update_soft_switch(0xC082, 0x1337);
  equal(diskToo.currPhysTrack, 4);
  equal(diskToo.phases.toString(), [0,0,1,0].toString());
});
  
test("Find Direction method ending inbetween", function() {
  expect(2);
  diskToo.currPhysTrack = 15;
  diskToo.findDirection([1,0,0,0], [1,1,0,0]);
  equal(diskToo.currPhysTrack, 16);
  diskToo.findDirection([0,0,1,0], [0,1,1,0]);
  equal(diskToo.currPhysTrack, 15);
});

test("Find Direction method ending on whole track", function() {
  expect(3);
  diskToo.currPhysTrack = 10;
  diskToo.findDirection([0,0,0,0], [0,0,0,0]);
  equal(diskToo.currPhysTrack, 10);
  diskToo.findDirection([0,1,1,0], [0,0,1,0]);
  equal(diskToo.currPhysTrack, 11);
  diskToo.findDirection([0,1,1,0], [0,1,0,0]);
  equal(diskToo.currPhysTrack, 10);
});

test("Edge cases in find Direction", function() {
  expect(4);
  diskToo.currPhysTrack = 5;
  diskToo.findDirection([0,0,0,1], [1,0,0,1]);
  equal(diskToo.currPhysTrack, 6);
  diskToo.findDirection([1,0,0,0], [1,0,0,1]);
  equal(diskToo.currPhysTrack, 5);
  diskToo.findDirection([1,0,0,1], [1,0,0,0]);
  equal(diskToo.currPhysTrack, 6);
  diskToo.findDirection([1,0,0,1], [0,0,0,1]);
  equal(diskToo.currPhysTrack, 5);
});

test("Finding the actual track", function () {
  expect(3);
  diskToo.currPhysTrack = 0;
  diskToo.phases = [0,0,0,0];
  diskToo.update_soft_switch(0xC081, 0x1337);
  diskToo.update_soft_switch(0xC083, 0x1337);
  diskToo.update_soft_switch(0xC080, 0x1337);
  diskToo.update_soft_switch(0xC085, 0x1337);
  diskToo.update_soft_switch(0xC082, 0x1337);
  equal(diskToo.currTrack, 1);
  equal(diskToo.onRealTrack, true);
  diskToo.update_soft_switch(0xC087, 0x1337);
  diskToo.update_soft_switch(0xC084, 0x1337);
  equal(diskToo.onRealTrack, false);
});
